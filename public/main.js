// ENUM CODES - will recieve from server
var ENUM_CODES = false;

var forceReload = true;
var PI2 = Math.PI * 2, lastCalledTime, fps;
var canvas, ctx, consoleUL, fpsMeter; // Canvas, 2d context and console html elements
var nicknameContainer, nicknameTxt, nicknameBtn; // Nickname container, text box and button elements
var scrolled = true, canvasHlf = {w: 0, h: 0}; // If the scroll bar is at the bottom of the console

// Game data - player
var mouse = { pos: {x: 0, y: 0} };
var cam = { pos: {x: 0, y: 0} };
var viewPlyRadius = 46;
var player = { nickname: '', colour: {r: 0, g: 0, b: 0}, pos: {x: 0, y: 0}, vel: {x: 0, y: 0}, accel: {x: 0, y: 0}, radius: 24, mOffset: 32, mRad: 56, mPressed: false, alive: false };
player.mRad = player.radius + player.mOffset;
var viewScale = 1, targetViewScale = 1; 
var serverSettings = false;
var lastPlayerUpdate = Date.now();
var constPlyData = {};
var foodPellets = [];
var statusCode = false;

// Socket IO
var clientId;
var otherClients = [];
var socket = io();

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
    return 'rgb('+Math.round(r * 255)+','+Math.round(g * 255)+','+Math.round(b * 255)+')';
}

// Calc object in and outer colour
function calcCols(hue, object) {
    object.colour = HSVtoRGB(hue, 0.45, 1);
    object.outColour = HSVtoRGB(hue, 1, 1);
    return object;
}
 
// Handle 'server_settings' message 
socket.on('server_settings', function(data) { 
    if (statusCode && ENUM_CODES && statusCode == ENUM_CODES.STATUS.PLAYING) {
        if (forceReload) {
            window.location.reload(true);
        }
        else {
            log('Warning! Game already playing, server mismatch!');
            log('Returning to home screen!');
            nicknameContainer.style = ''; statusCode = ENUM_CODES.STATUS.IDLE;
            mouse = { pos: {x: 0, y: 0} }; cam = { pos: {x: 0, y: 0} };
            player = { nickname: '', colour: {r: 0, g: 0, b: 0}, pos: {x: 0, y: 0}, vel: {x: 0, y: 0}, accel: {x: 0, y: 0}, radius: 24, mOffset: 32, mRad: 56, mPressed: false };
            player.mRad = player.radius + player.mOffset;
            viewScale = 1, targetViewScale = 1; 
            lastPlayerUpdate = Date.now();  constPlyData = {}; foodPellets = []; otherClients = [];
        }
    }
    log('Recieved server settings.');
    serverSettings = data.settings;
    ENUM_CODES = data.enums;
    statusCode = ENUM_CODES.STATUS.IDLE;
});

// Handle 'sync_const_data' by syncing the constant player data (colour and names)
socket.on('sync_const_data', function(data) {
    constPlyData = data;
    for (var k in constPlyData) {
        if (constPlyData.hasOwnProperty(k)) {
            constPlyData[k] = calcCols(constPlyData[k].hue, constPlyData[k]);
        }
    }
});

// Handle 'login' server message
socket.on('login', function (data) {
    switch (data.code) {
        case ENUM_CODES.LOGIN.SUCCESS:
            clientId = data.userId;
            player.nickname = data.nickname;
            player.alive = true;
            player = calcCols(data.hue, player);
            foodPellets = data.foodPellets;
            for (var i = 0; i < foodPellets.length; i++) {
                foodPellets[i] = calcCols(Math.random(), foodPellets[i]);
            }
            log('Successful login, assigned id: ' + clientId);
            statusCode = ENUM_CODES.STATUS.PLAYING;
            nicknameContainer.style = 'visibility: hidden;';
            canvasDraw();
            break;
        case ENUM_CODES.LOGIN.EXISTING_NAME:
            log('Login failed, nickname already in use!');
            break;
        case ENUM_CODES.LOGIN.ALREADY_LOGGED_IN:
            log('Login failed, you are already logged in!');
            break;
        case ENUM_CODES.LOGIN.INVALID_NAME:
            log('Login failed, name is invalid!');
            break;
        default:
            log('Login error occured, please contact an admin');
            break;
    }
});

// print the server message recieved into the message box
socket.on('server_message', function (data) {
    log(data.message);
});

// Update player info from server data
socket.on('update', function (data) {
    otherClients = data.othersData;
    for (var i = 0; i < otherClients.length; i++) {
        var curConstDat = constPlyData[otherClients[i].id];
        if (curConstDat) {
            otherClients[i].nickname = curConstDat.nickname;
            otherClients[i].colour = curConstDat.colour;
            otherClients[i].outColour = curConstDat.outColour;
        }
        else {
            console.log('Warning! name and colour has not been found for the player!');
        }
    }
    player.pos = data.plyData.pos;
    player.vel = data.plyData.vel;
    player.radius = data.plyData.radius;
    player.alive = data.plyData.alive;
    player.mRad = player.radius + player.mOffset;
    cam.pos = player.pos;
    lastPlayerUpdate = Date.now();

    if (data.pellets_created.length > 0) {
        for (var i = 0; i < data.pellets_created.length; i++) {
            foodPellets[data.pellets_created[i].index] = {pos: data.pellets_created[i].pos};
            foodPellets[data.pellets_created[i].index] = calcCols(Math.random(), foodPellets[data.pellets_created[i].index]);
        }
    }

    if (player.alive) socket.emit('update', { accel:  {x: player.accel.x, y: player.accel.y}, mPressed: player.mPressed });
    else {
        delete clientId;
        player = { nickname: '', colour: {r: 0, g: 0, b: 0}, pos: {x: 0, y: 0}, vel: {x: 0, y: 0}, accel: {x: 0, y: 0}, radius: 24, mOffset: 32, mRad: 56, mPressed: false, alive: false };
        foodPellets = [];
        log('Died, returning to menu');
        statusCode = ENUM_CODES.STATUS.IDLE;
        nicknameContainer.style = '';
    }
});

// repeatedly used, useful functions
function toScrnPos(pos, lineFix=false) { return {x: canvasHlf.w+(pos.x-cam.pos.x)*viewScale + (lineFix ? 0.5 : 0), y: canvasHlf.h+(pos.y-cam.pos.y)*viewScale + (lineFix ? 0.5 : 0)}; }
function mvTo(_x, _y, lineFix=false) { var scrnPos = toScrnPos({x:_x,y:_y}, lineFix); ctx.moveTo(scrnPos.x, scrnPos.y); }
function lnTo(_x, _y, lineFix=false) { var scrnPos = toScrnPos({x:_x,y:_y}, lineFix); ctx.lineTo(scrnPos.x, scrnPos.y); }
function arc(_x, _y, r, s, e, lineFix=false, ignoreScaling=false) { var scrnPos = toScrnPos({x:_x,y:_y}, lineFix); ctx.arc(scrnPos.x, scrnPos.y, r * (ignoreScaling ? 1 : viewScale), s, e); }
function strokeTxt(_txt, _x, _y, lineFix=false) { var scrnPos = toScrnPos({x:_x,y:_y}, lineFix); ctx.strokeText(_txt, scrnPos.x, scrnPos.y); }
function fillTxt(_txt, _x, _y, lineFix=false) { var scrnPos = toScrnPos({x:_x,y:_y}, lineFix); ctx.fillText(_txt, scrnPos.x, scrnPos.y); }
function lerp (value, targetValue, fraction) { return value + (targetValue - value) * fraction; }
function clamp (value,max,min) { if (value < min) { return min; } else if (value > max) { return max; } else { return value; } }
function clampToBounds(pos) { 
    pos.x = clamp(pos.x, -serverSettings.gridCentre.x, serverSettings.gridCentre.x);
    pos.y = clamp(pos.y, -serverSettings.gridCentre.y, serverSettings.gridCentre.y);
    return pos;
}
function incrementVel(plyData, dt) {
    var tmpMult = (0.3 + (1/((plyData.radius - serverSettings.initPlyRadius + 5) / 5))*0.7);
    plyData.pos.x += plyData.vel.x * dt * serverSettings.speedMod * tmpMult;
    plyData.pos.y += plyData.vel.y * dt * serverSettings.speedMod * tmpMult;
    plyData.pos = clampToBounds(plyData.pos);
    return plyData;
}

// Draw player given by plyData
function drawPlayer(plyData) {
    ctx.lineWidth = 5*viewScale;
    if (plyData.outColour) { ctx.strokeStyle = plyData.outColour; } else { ctx.strokeStyle = '#f22'; }
    if (plyData.colour) { ctx.fillStyle = plyData.colour; } else { ctx.fillStyle = '#fff'; }

    for (var j = 0; j < 2; j++) {
        ctx.beginPath();
        arc(plyData.pos.x, plyData.pos.y, plyData.radius, 0, PI2);
        if (j == 0) { ctx.stroke(); } else { ctx.fill(); } 
    }

    // Draw direction nib thing
    if (plyData.mPressed) {
        ctx.fillStyle = '#777';
        ctx.beginPath();
        arc(plyData.pos.x + (plyData.accel.x * viewScale * (player.mOffset + plyData.radius))/viewScale, plyData.pos.y + (plyData.accel.y * viewScale * (player.mOffset + plyData.radius))/viewScale, 6, 0, PI2, false, true);
        ctx.fill();
    }

    // Draw player name tag with custom scaling and offseting
    ctx.lineWidth = 16;
    ctx.font = '160px Arial';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';

    var txtMeasure = ctx.measureText(plyData.nickname);
    var scaleX = (((plyData.radius * 2)-4) / txtMeasure.width)*viewScale;
    ctx.save();
    ctx.scale(scaleX, scaleX);

    var scrnPos = toScrnPos({x:plyData.pos.x,y:(plyData.pos.y+52*scaleX/viewScale)}); 
    scrnPos = {x:scrnPos.x/scaleX,y:scrnPos.y/scaleX};
    ctx.strokeText(plyData.nickname, scrnPos.x, scrnPos.y);
    ctx.fillText(plyData.nickname, scrnPos.x, scrnPos.y);

    ctx.restore();
}

// Function to draw food pellets
function drawPellet(pelletData) {
    ctx.fillStyle = pelletData.colour;
    ctx.strokeStyle = pelletData.outColour; ctx.lineWidth = viewScale*2;
    ctx.beginPath();
    arc(pelletData.pos.x, pelletData.pos.y, 8, 0, PI2);
    ctx.fill();
    ctx.stroke();
}

// Draw canvas
function canvasDraw() {
    var deltaTime = 0;
    if(!lastCalledTime) {
        lastCalledTime = Date.now();
        fps = 0;
    }
    else {
        deltaTime = (Date.now() - lastCalledTime)/1000;
        lastCalledTime = Date.now();
        fps = 1/deltaTime;
    }
    //fpsMeter.innerHTML = "FPS: " + Math.floor(fps) + " " + Math.floor(deltaTime*1000)/1000 + "s";
    viewScale = lerp(viewScale, (viewPlyRadius / player.radius) * targetViewScale, 0.15);

    // Update player and other clients positions between position updates from server
    var timeSinceLastPlayerUpdate = (Date.now() - lastPlayerUpdate)/1000;
    lastPlayerUpdate = Date.now();

    // Update client side player positions (smoothing)
    player = incrementVel(player, timeSinceLastPlayerUpdate);
    cam.pos = player.pos;

    for (var i = 0; i < otherClients.length; i++) 
    { otherClients[i] = incrementVel(otherClients[i], timeSinceLastPlayerUpdate); }

    // DRAW
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#d3d3d3'; ctx.lineWidth = 1;
    for (var i = 0; i <= serverSettings.gridCount.h; i++) {
        var tmpY = serverSettings.gridSize.h * i + serverSettings.gridCentre.y;
        mvTo(serverSettings.gridCentre.x, tmpY, true);
        lnTo(-serverSettings.gridCentre.x, tmpY, true);
    }
    for (var i = 0; i <= serverSettings.gridCount.w; i++) {
        var tmpX = serverSettings.gridSize.w * i + serverSettings.gridCentre.x;
        mvTo(tmpX, serverSettings.gridCentre.y, true);
        lnTo(tmpX, -serverSettings.gridCentre.y, true);
    }
    ctx.stroke();

    // Draw pellets
    for (var i = 0; i < foodPellets.length; i++) {
        drawPellet(foodPellets[i]);
    }

    // Draw other players
    for (var i = 0; i < otherClients.length; i++) {
        drawPlayer(otherClients[i]);
    }

    // Draw player
    drawPlayer(player);

    // Draw zoom level
    ctx.lineWidth = 3;
    ctx.font = '30px Arial';
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    var viewScaleTxt = 'x'+(Math.floor(targetViewScale*1000)*0.001);
    if (viewScaleTxt.length > 6) { viewScaleTxt = viewScaleTxt.substr(0,6); }
    ctx.strokeText(viewScaleTxt, 10, 40);
    ctx.fillText(viewScaleTxt, 10, 40);

    if (statusCode == ENUM_CODES.STATUS.PLAYING) window.requestAnimationFrame(canvasDraw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Handle mouse movement
function mouseMove(event) {
    if (event.clientX != null && event.clientY != null) {
        mouse.pos.x = event.clientX-canvasHlf.w;
        mouse.pos.y = event.clientY-canvasHlf.h;
        player.accel.x = mouse.pos.x;
        player.accel.y = mouse.pos.y;
        var accelMagnitude = Math.sqrt(Math.pow(player.accel.x,2) + Math.pow(player.accel.y,2));
        if (accelMagnitude > player.mRad*viewScale) {
            var divisor = accelMagnitude / (player.mRad*viewScale);
            player.accel.x /= divisor;
            player.accel.y /= divisor;
        }
        player.accel.x /= player.mRad * viewScale;
        player.accel.y /= player.mRad * viewScale;
    }
    else {
        mouse.pos = { x: canvasHlf.w, y: canvasHlf.h };
    }
}

// Handle mouse button events
function mouseDown(event) {
    if (event.button == 0) {
        player.mPressed = true;
    }
}

function mouseUp(event) {
    if (event.button == 0) {
        player.mPressed = false;
    }
}

// Handle mouse scroll wheel events
function mouseWheel(event) {
    targetViewScale = clamp(targetViewScale + event.deltaY * 0.0025, 5, 0.25);
}

// Log a message in the console, if fail store in message buffer
var messageBuffer = [];
function log(message, addToBuffer = true) {
    if (consoleUL) {
        var newLog = document.createElement('li');
        newLog.innerHTML = '> ' + message;
        consoleUL.appendChild(newLog);
        updateScroll();
    }
    else if (addToBuffer) { 
        messageBuffer.push('> ' + message); 
        setTimeout(releaseBuffer, 100);
    }
}

// Attempt to release the log buffer into the console
function releaseBuffer() {
    if (consoleUL) {
        for (var i = 0; i < messageBuffer.length; i++) {
            log(messageBuffer[i],false);
        }
    }
    else { setTimeout(releaseBuffer, 100); }
}

// Update scroll bar of the console
function updateScroll() {
    if (scrolled) {
        consoleUL.scrollTop = consoleUL.scrollHeight;
    }
}

// Resize canvas to fill page
function windowResize() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvasHlf = {w: canvas.width*0.5, h: canvas.height*0.5};
    }
}

// Handle nickname enter click
function enterNickname() {
    log('Login attempt with nickname: ' + nicknameTxt.value);
    socket.emit('login', { nickname: nicknameTxt.value });
}

// Page init
function pageLoaded() {
    consoleUL = document.getElementById('console').children[0];
    canvas = document.getElementById('c');
    nicknameContainer = document.getElementById('nickname_menu');
    nicknameTxt = document.getElementById('nickname_txt');
    nicknameBtn = document.getElementById('nickname_btn');
    //fpsMeter = document.getElementById('fps_meter');
    if (consoleUL && canvas && nicknameContainer && nicknameTxt && nicknameBtn/* && fpsMeter*/) {
        ctx = canvas.getContext('2d');
        consoleUL.addEventListener('scroll', function () { scrolled = (consoleUL.scrollTop + consoleUL.offsetHeight == consoleUL.scrollHeight); });
        nicknameBtn.addEventListener('click', enterNickname);
        windowResize();
        window.addEventListener('resize', windowResize);
        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mousedown', mouseDown);
        document.addEventListener('mouseup', mouseUp);
        document.addEventListener("wheel", mouseWheel);
    }
}
window.addEventListener('load', pageLoaded);