const log4js = require('log4js');
const randtoken = require('rand-token');
const bUtils = require('butils');

// Constants
const bConfigs = bUtils.getBmateConfigs();
const server = bUtils.getServer();
const io = require('socket.io')(server);
const logger = log4js.getLogger();

const socketMap = new Map();
const accessTokenMap = new Map();

server.listen(bConfigs.socketServer.port, () => {
    logger.info(`Server up and runnig at PORT ${bConfigs.socketServer.port}`);
});

io.on('connection', (socket) => {

    // Events methods

    const onRobotRegister = (rInfo) => {
        rInfo = rInfo || {};

        if (!rInfo.nickName) {
            emitErrorEvent('robot_register', 'nickName param is mandatory');

            return;
        }

        const robot = {
            nickName:   rInfo.nickName,
            viewers:    []
        };

        socket.robot = robot;

        emitSuccessEvent('robot_register', robot);

        logger.info(`Robot [${socket.id}] registered`);
    };

    const onGetRobotRoomAccess = () => {
        const robot = socket.robot;

        if (!robot) {
            emitErrorEvent('get_robot_room_access', 'Robot not found');

            return;
        }

        const accessToken = randtoken.generate(16);

        accessTokenMap.set(accessToken, socket);

        logger.trace(`Access token granted for robot "${socket.id}". Access Token: "${accessToken}"`);

        emitSuccessEvent('get_robot_room_access', { accessToken: accessToken });
    };

    const onRobotMoveRequest = (moveInstructions) => {
        const robotSocket = getRobotSocket();

        if (!robotSocket) {
            emitErrorEvent('robot_move_request', `No robot found for the socket id ${socket.id}`);

            return;
        }

        robotSocket.emit('do_robot_movement', moveInstructions);

        emitSuccessEvent('robot_move_request');
    };

    const onJoinRobotRoom = (accessToken, viewerInfo) => {
        const robotSocket = accessTokenMap.get(accessToken);

        if (!robotSocket) {
            emitErrorEvent('join_robot_room', `No robot found for the passing accessToken "${accessToken}"`);

            return;
        }

        viewerInfo = viewerInfo || {};

        if (!viewerInfo.name) {
            emitErrorEvent('join_robot_room', 'The viewerInfo.name param is mandatory');

            return;
        }

        const viewer = {
            id:     socket.id,
            name:   viewerInfo.name,
            robot:  {
                id: robotSocket.id
            }
        };

        // accessTokenMap.delete(accessToken);
        socket.viewer = viewer;
        robotSocket.emit('viewer_add', viewer);

        emitToAllRobotViewers(robotSocket, 'viewer_add', viewer);
        robotSocket.robot.viewers.push(viewer);
        emitSuccessEvent('join_robot_room', viewer);
    };

    const onSignalingMessage = (message) => {

        if (!message) {
            emitErrorEvent('signaling_message', 'You must pass a message parameter');

            return;
        }

        const receiver = socketMap.get(message.to);
        const emitterId = socket.id;

        if (!receiver) {
            emitErrorEvent('signaling_message', `No receiver socket found for the id ${message.to}`);

            return;
        }

        // Validate robot room. Viewers checking the same viewers list of the robot and robot if the viewer
        // is on its viewer list
        if (socket.viewer) {
            const robotSocket = socketMap.get(socket.viewer.robot.id);

            if (!robotSocket) {
                emitErrorEvent('signaling_message', `No robot found for the viewer id ${viewer.id}`);

                return;
            }

            const receiverList = robotSocket.robot.viewers.filter((viewer) => {
                return viewer.id == receiver.id;
            });

            // Validate if the socket with the receiver id is on the robot viewer list or is the robot
            if (receiverList.length === 0 && receiver.id != robotSocket.id) {
                emitErrorEvent('signaling_message', `No viewers found for the receiver id "${receiver.id}"`);

                return;
            }

        } else if (socket.robot) {

            const robotReceiverList = socket.robot.viewers.filter((viewer) => {
                return viewer.id == receiver.id;
            });

            if (robotReceiverList.length === 0) {
                emitErrorEvent('signaling_message', `No viewers found in robot for the receiver id "${receiver.id}"`);

                return;
            }
        } else {
            emitErrorEvent('signaling_message', `The socket seems not paired with any robot or peer`);

            return;
        }

        message.from = emitterId;

        receiver.emit('signaling_message', message);
        emitSuccessEvent('signaling_message', message);
    };

    const onDisconnect = () => {
        const robotSocket = getRobotSocket();

        if (robotSocket) {

            if (socket.viewer) {
                logger.trace(`Socket VIEWER "${socket.id}" disconnected`);

                robotSocket.emit('viewer_left', socket.viewer);
                emitToAllRobotViewers(robotSocket, 'viewer_left', socket.viewer);
            } else if (socket.robot) {
                logger.trace(`Socket ROBOT "${socket.id}" disconnected`);

                robotSocket.emit('robot_disconnected', socket.robot);
                emitToAllRobotViewers(robotSocket, 'robot_disconnected');
            }
        } else
            logger.trace(`Socket [${socket.id}] disconnected`);


        // Remove socket from socketMap
        socketMap.delete(socket.id);
    };

    // On connection add socket ro socketMap
    socketMap.set(socket.id, socket);

    // Register robot events
    socket.on('robot_register', onRobotRegister);

    socket.on('get_robot_room_access', onGetRobotRoomAccess);

    socket.on('robot_move_request', onRobotMoveRequest);

    // Register client events

    socket.on('join_robot_room', onJoinRobotRoom);

    // Signaling RTC events

    socket.on('signaling_message', onSignalingMessage);

    socket.on('disconnect', onDisconnect);

    // Utils methods

    const emitErrorEvent = (eventName, err) => {
        socket.emit(`${eventName}:error`, err);

        logger.error(`${eventName}:error`, err);
    };

    const emitSuccessEvent = (eventName, param) => {
        socket.emit(`${eventName}:success`, param);

        logger.info(`${eventName}:success`, param);
    };

    const emitToAllRobotViewers = (robotSocket, eventName, params) => {

        robotSocket.robot.viewers.map((viewer) => {
            const viewerSocket = socketMap.get(viewer.id);

            if (viewerSocket)
                viewerSocket.emit(eventName, params);
        });
    };

    const getRobotSocket = () => {

        if (socket.viewer)
            return socketMap.get(socket.viewer.robot.id);
        else if (socket.robot)
            return socketMap.get(socket.id);
    };
});
