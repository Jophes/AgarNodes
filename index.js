// ENUM CODES - to be synced with client
var ENUM_CODES = {
    LOGIN: { SUCCESS: 0, EXISTING_NAME: 1, ALREADY_LOGGED_IN: 2, INVALID_NAME: 3, ERROR: 4 },
    STATUS: { IDLE: 0, PLAYING: 1}
};

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 8082;
 
server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

app.use(express.static(__dirname + '/public'));

// Server side settings for the client
var serverSettings = { gridCount: {w: 32, h: 32}, gridSize: {w: 100, h: 100}, gridCentre: {x: 0, y: 0}, speedMod: 4, tick: 0.03, tickMS: 1, initPlyRadius: 24 };
serverSettings.totalSize = { w: serverSettings.gridCount.w*serverSettings.gridSize.w, h: serverSettings.gridCount.h*serverSettings.gridSize.h };
serverSettings.gridCentre = { x: serverSettings.totalSize.w*-0.5, y: serverSettings.totalSize.h*-0.5 };
serverSettings.tickMS = serverSettings.tick * 1000;
  
// Rolling client counter and store for all client objects
var idCounter = 1;
var activeClients = [];

// Food pellets
var foodPellets = [];
var activePellets = 256;
function generatePellet() { return {pos: {x: Math.floor(Math.random()*serverSettings.totalSize.w + serverSettings.gridCentre.x), y: Math.floor(Math.random()*serverSettings.totalSize.h + serverSettings.gridCentre.y)}}; }
for (var i = 0; i < activePellets; i++) {
    foodPellets.push(generatePellet());
}

// Convert a HSV colour to RGB colour space
function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

// Log the message along side the client's unique address information
function log (clientAddress, message) {
    console.log(clientAddress.remoteAddress + ":" + clientAddress.remotePort + " > " + message);
}

function lerp (value, targetValue, fraction) { return value + (targetValue - value) * fraction; }

// Clamp the value inbetween the max and min parameters
function clamp (value,max,min) { 
    if (value < min) { return min; }
    else if (value > max) { return max; }
    return value;
}

// Clamp the incoming position to within the server's world bounds
function clampToBounds (pos) { 
    pos.x = clamp(pos.x, -serverSettings.gridCentre.x, serverSettings.gridCentre.x);
    pos.y = clamp(pos.y, -serverSettings.gridCentre.y, serverSettings.gridCentre.y);
    return pos;
}

// Function to be ran every tick of the server, for performing physics updates
function serverTick () {
    for (var i = 0; i < activeClients.length; i++) {
        if (activeClients[i].alive) {
            activeClients[i].vel.x *= 0.9; activeClients[i].vel.y *= 0.9;
            if (activeClients[i].mPressed) {
                activeClients[i].vel.x += activeClients[i].accel.x * serverSettings.tick * 384;
                activeClients[i].vel.y += activeClients[i].accel.y * serverSettings.tick * 384;
            }
            var tmpMult = (0.3 + (1/((activeClients[i].smoothedRadius - serverSettings.initPlyRadius + 5) / 5))*0.7);
            activeClients[i].pos.x += activeClients[i].vel.x * serverSettings.tick * serverSettings.speedMod * tmpMult;
            activeClients[i].pos.y += activeClients[i].vel.y * serverSettings.tick * serverSettings.speedMod * tmpMult;
            activeClients[i].pos = clampToBounds(activeClients[i].pos);

            activeClients[i].smoothedRadius = lerp (activeClients[i].smoothedRadius, activeClients[i].radius, 0.25);

            // Check if player collided with food pellets
            for (var j = 0; j < foodPellets.length; j++) {
                var dist = Math.sqrt(Math.pow(foodPellets[j].pos.x - activeClients[i].pos.x,2) + Math.pow(foodPellets[j].pos.y - activeClients[i].pos.y,2));
                if (dist < 8 + activeClients[i].radius) {
                    foodPellets[j] = generatePellet();
                    for (var k = 0; k < activeClients.length; k++) {
                        activeClients[k].new_pellets.push({index: j, pos: foodPellets[j].pos});
                    }
                    activeClients[i].radius += 2;
                }
            }

            // Check if player collided with another player
            for (var j = 0; j < activeClients.length; j++) {
                if (i != j && activeClients[i].alive && activeClients[j].alive) {
                    var dist = Math.sqrt(Math.pow(activeClients[j].pos.x - activeClients[i].pos.x,2) + Math.pow(activeClients[j].pos.y - activeClients[i].pos.y,2)) - activeClients[i].radius - activeClients[j].radius;
                    if (dist <= 0) {
                        var winningIndex, losingIndex;
                        if (activeClients[i].radius > activeClients[j].radius) { winningIndex = i; losingIndex = j; }
                        else { winningIndex = j; losingIndex = i; }
                        activeClients[winningIndex].radius += activeClients[losingIndex].radius * 0.75;
                        activeClients[losingIndex].alive = false;
                    }
                }
            }
        }
    }
}
// Call the server tick function after the value in the server settings has elapsed
setInterval(serverTick, serverSettings.tickMS);

// Function used to update every client with all the current players names and colours
function syncConstPlyData () {
    var syncData = {};
    for (var i = 0; i < activeClients.length; i++) {
        syncData[activeClients[i].id] = {hue: activeClients[i].hue, nickname: activeClients[i].nickname };
    }
    io.sockets.emit('sync_const_data', syncData);
}

// Upon a use connecting
io.on('connection', function (socket) {
    var broadcastTimer;
    var clientAddress = socket.request.connection;
    var clientData;

    socket.emit('server_settings', {settings: serverSettings, enums: ENUM_CODES});
    socket.emit('server_message', { message: 'Welcome to Cheesy Agar!' });

    function broadcastPositionData () {
        var otherClientsData = [];
        for (var i = 0; i < activeClients.length; i++) {
            if (activeClients[i]) {
                if (activeClients[i].id != clientData.id) { otherClientsData.push({ id: activeClients[i].id, pos: activeClients[i].pos, vel: activeClients[i].vel, accel: activeClients[i].accel, mPressed: activeClients[i].mPressed, radius: activeClients[i].smoothedRadius }); }
            }
        }
        socket.emit('update', { othersData: otherClientsData, plyData: { pos: clientData.pos, vel: clientData.vel, radius: clientData.smoothedRadius, alive: clientData.alive }, pellets_created: clientData.new_pellets });
        clientData.new_pellets = [];
        if (!clientData.alive) {
            if (broadcastTimer) {
                clearInterval(broadcastTimer);
                for (var i = 0; i < activeClients.length; i++) {
                    if (activeClients[i].id == clientData.id) {
                        activeClients.splice(i, 1);
                        log(clientAddress, 'Client has disconnected, removing id = ' + clientData.id + ' nickname = ' + clientData.nickname);
                        socket.broadcast.emit('server_message', { message: clientData.nickname+' has disconnected' });
                        break;
                    }
                }
                //delete clientData;
            }
        }
    }

    log(clientAddress, 'Client has connected');

    // Provide the new client a unique id
    socket.on('login', function(data) {
        if (typeof clientData === 'undefined' || (clientData && !clientData.alive)) {
            if (data.nickname == '') {
                log(clientAddress, 'Attempted login with name = ' + data.nickname + ', but the name is invalid');
                socket.emit('login', { code: ENUM_CODES.LOGIN.INVALID_NAME });
            }
            else {
                var existing = false;
                for (var i = 0; i < activeClients.length; i++) {
                    if (activeClients[i].nickname == data.nickname) {
                        existing = true;
                        break;
                    }
                }
                if (!existing && data.nickname != '') { 
                    clientData = { id: idCounter, nickname: data.nickname, hue: 0, mPressed: false, pos: {x: 0, y: 0}, vel: {x: 0, y: 0}, accel: {x: 0, y: 0}, radius: 24, smoothedRadius: 0, new_pellets: [], alive: true };
                    clientData.hue = Math.random(); clientData.smoothedRadius = clientData.radius;
                    // Log the loggin message to the server's console, add the new client to the client array, increment the id counter, sync player data, send a server message to all clients
                    log(clientAddress, 'Client has logged in with nickname = ' + clientData.nickname + ', assigned id = ' + clientData.id);
                    socket.emit('login', { code: ENUM_CODES.LOGIN.SUCCESS, userId: clientData.id, nickname: clientData.nickname, hue: clientData.hue, foodPellets: foodPellets });
                    socket.broadcast.emit('server_message', { message: clientData.nickname+' has connected' });
                    activeClients.push(clientData);
                    idCounter++;
                    syncConstPlyData();
                    broadcastTimer = setInterval(broadcastPositionData, serverSettings.tickMS);
                }
                else {
                    log(clientAddress, 'Attempted login with name = ' + data.nickname + ', but it already exists');
                    socket.emit('login', { code: ENUM_CODES.LOGIN.EXISTING_NAME });
                }
            }
        }
        else {
            log(clientAddress, 'Attempted login with name = ' + data.nickname + ', but are already logged in');
            socket.emit('login', { code: ENUM_CODES.LOGIN.ALREADY_LOGGED_IN });
        }
    });

    // Collect client data and perform validation checks upon the data to ensure no tampering
    socket.on('update', function (data) {
        clientData.accel = data.accel;
        clientData.mPressed = data.mPressed;
        var accelMagnitude = Math.sqrt(Math.pow(clientData.accel.x,2) + Math.pow(clientData.accel.y,2));
        if (accelMagnitude > 1) {
            // Suppress warnings if only a little over the limit
            if (accelMagnitude > 1.01) {
                log(clientAddress, 'Warning, invalid accel player values! id: ' + clientData.id + ' speed: ' + accelMagnitude + ' x: ' + clientData.accel.x + ' y: ' + clientData.accel.y);
            }
            clientData.accel.x /= accelMagnitude;
            clientData.accel.y /= accelMagnitude;
        }
        for (var i = 0; i < activeClients.length; i++) {
            if (clientData && activeClients[i].id == clientData.id) {
                activeClients[i].accel = clientData.accel;
                activeClients[i].mPressed = clientData.mPressed;
                break;
            }
        }
    });

    // Upon client disconnect remove client
    socket.on('disconnect', function () {
        if (typeof clientData !== 'undefined') {
            for (var i = 0; i < activeClients.length; i++) {
                if (activeClients[i].id == clientData.id) {
                    activeClients.splice(i, 1);
                    log(clientAddress, 'Client has disconnected, removing id = ' + clientData.id + ' nickname = ' + clientData.nickname);
                    socket.broadcast.emit('server_message', { message: clientData.nickname+' has disconnected' });
                    break;
                }
            }
        } 
        else {
            log(clientAddress, 'Client has disconnected');
        }
    });
});