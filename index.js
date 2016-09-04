'use strict';

let express = require('express');
let app = express();
let server = require('http').Server(app);
let io = require('socket.io')(server);
var log4js = require('log4js');
var logger = log4js.getLogger();

const PORT = 8989;

server.listen(PORT, () => {
    logger.info(`Server up and runnig at PORT ${PORT}`);
});

app.use(express.static(`${__dirname}/public`));

let randtoken = require('rand-token');
let robotsMap = new Map();

io.on('connection', (socket) => {

    /**
     * @event `robotregister`
     * @param nickName
     *
     * Triggered events
     * @event `robotregister:success`
     * @param token
     * @param nickName
     */
    socket.on('robotregister', (opts) => {
        let token = randtoken.generate(4);

        opts = opts || {};

        let nickName = opts.nickName;

        robotsMap.set(token, {
            token: token,
            nickName: nickName,
            socket: socket,
            listeners : []
        });

        socket.robotToken = token;

        logger.info(`Robot [${token}] registered`);

        socket.emit('robotregister:success', { token: token, nickName: nickName });
    });

    /**
     * @event `robotregister`
     * @param token
     * @param buffer
     *
     * Triggered events
     * @event `robotstream:data`
     * @param buffer
     *
     * @event `robotstream:error`
     * @param err
     */
    socket.on('robotstream', (opts) => {
        opts = opts || {};

        let token = opts.token;
        let buffer = opts.buffer;

        let robot = robotsMap.get(token);

        if (robot) {

            for (let listener of robot.listeners) {
                listener.emit('robotstream:data', { data: buffer });
            }
        } else {
            socket.emit('robotstream:error', `Robot ${token} not found or active`);
        }
    });

    /**
     * @event `pairrobot`
     * @param token
     *
     * Triggered events
     * @event `pairrobot:success`
     * @param token
     * @param nickName
     *
     * @event `pairrobot:error`
     * @param err
     */
    socket.on('pairrobot', (opts) => {
        opts = opts || {};

        let token = opts.token;

        let robot = robotsMap.get(token);

        if (robot) {

            if (robot.listeners.length <= 0) {
                robot.listeners.push(socket);

                socket.isRobotClient = true;
                socket.robotToken = robot.token;

                socket.emit('pairrobot:success', { token: robot.token, nickName: robot.nickName });
            } else {
                socket.emit('pairrobot:error', `Robot "${robot.nickName}" already have a listener`);
            }
        } else {
            socket.emit('pairrobot:error', `Robot "${token}" not found or active`);
        }
    });

    /**
     * @event `robotmoverequest`
     * @param moveInstructions
     *
     * Triggered events
     * @event `robotmoverequest:success`
     * @param successMessage
     *
     * @event `robotmoverequest:error`
     * @param err
     *
     * @event `robotmove`
     * @param moveInstructions
     */
    socket.on('robotmoverequest', (moveInstructions) => {

        if (!socket.isRobotClient || !socket.robotToken) {
            socket.emit('robotmoverequest:error', 'You are not paired with any robot');
        } else {
            let robot = robotsMap.get(socket.robotToken);

            if (robot) {
                robot.socket.emit('robotmove', moveInstructions);

                socket.emit('robotmoverequest:success', 'Your move request was done');
            } else {
                socket.emit('robotmoverequest:error', `Robot "${socket.robotToken}" not found or active`);
            }
        }
    });

    socket.on('disconnect', () => {
        logger.trace('Bye sucker!');

        if (socket.isRobotClient) {
            disconnectRobotClient(socket);
        } else if (socket.robotToken) {
            disconnectRobot(socket);
        }
    });
});

function disconnectRobotClient(socket) {

    if (socket.isRobotClient) {
        let robot = robotsMap.get(socket.robotToken);

        if (robot) {
            robot.listeners.shift();

            logger.trace('Robot client disconnected');
        }
    }
}

function disconnectRobot(socket) {

    if (socket.robotToken) {
        let robot = robotsMap.get(socket.robotToken);

        if (robot) {

            for (let listener of robot.listeners) {
                listener.emit('robotdisconnected');
            }

            robotsMap.delete(socket.robotToken);

            logger.trace(`Robot "${socket.robotToken}" disconnected`);
        }
    }
}
