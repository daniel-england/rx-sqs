const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const stats = require('./stats');
const {start} = require('./index');

const app = express();

// Sends static files  from the public path directory
app.use(express.static(path.join(__dirname, '/public')));

const wss = new WebSocket.Server({ port: 5555 });

wss.on('connection', (ws) => {
    console.log('incoming connection');
    const subscription = stats.stream
        .retry()
        .subscribe(
            stats => {
                return ws.send(JSON.stringify(stats));
            },
            error => console.error(error)
        );

    ws.on('error', (err) => {
        console.warn(`Client disconnected - reason: ${err}`);
    });

    ws.on('close', function close() {
        console.log('disconnected');
        subscription.unsubscribe();
    });
});

const port = 3000;
app.listen(port);
console.log('App listening on port ' + port);

// Server index.html page when request to the root is made
app.get('/', function (req, res, next) {
    res.sendfile('./public/index.html')
});

start();

