'use strict';

const mocha = require('mocha');
const chai = require('chai');
const io = require('socket.io-client');

const assert = chai.assert;
const robotSocket = io('http://localhost:8989');

let accesToken;

describe('Robot registration', () => {

    it('Should register with no error', (done) => {

        robotSocket.on('robot_register:success', (robot) => {
            assert.typeOf(robot, 'object');
            assert.property(robot, 'nickName');

            done();
        });
        robotSocket.on('robot_register:error', done);

        robotSocket.emit('robot_register', { nickName: 'BmateRobot' });
    });
    
});

describe('Return access token request', () => {

    it('Should return access token with no error', (done) => {

        robotSocket.on('get_robot_room_access:success', (obj) => {
            assert.typeOf(obj, 'object');
            assert.property(obj, 'accessToken');
            
            accesToken = obj.accessToken;

            done();
        });
        robotSocket.on('get_robot_room_access:error', done);

        robotSocket.emit('get_robot_room_access');
    });

});

describe('Try to connect a peer client to robotSocket', () => {
    let clientSocket;

    it('Should create a new socket client', (done) => {
        clientSocket = io('http://localhost:8989');

        clientSocket.on('connect', () => done());
        clientSocket.on('error', done);
    });

    it('Should get granted access to the robot', (done) => {

        clientSocket.on('join_robot_room:success', (viewer) => {
            assert.typeOf(viewer, 'object');
            assert.property(viewer, 'id');
            assert.property(viewer, 'name');
            assert.property(viewer, 'robot');
            assert.property(viewer.robot, 'id');

            done();
        });
        clientSocket.on('join_robot_room:error', done);
        
        clientSocket.emit('join_robot_room', accesToken, { name: 'Peer 1' });
    });

    it('Should send a "request_offer" through the signaling channel', (done) => {
        clientSocket.on('signaling_message:error', done);
        clientSocket.on('signaling_message:success', (message) => {
            assert.typeOf(message, 'object');
            assert.property(message, 'type');
            assert.property(message, 'from');
            assert.equal(message.from, clientSocket.id);

            done();
        });

        clientSocket.emit('signaling_message', { to: robotSocket.id, type: 'request_offer' });
    });

});
