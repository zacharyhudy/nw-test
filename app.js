/**
 * @file This is the main Express server.
 */

'use strict';

let bodyParser = require('body-parser');
let compress = require('compression');
let cookieParser = require('cookie-parser');
let express = require('express');
let favicon = require('serve-favicon');
let http = require('http');
let logger = require('morgan');
let path = require('path');

// Initialize Express app.
let app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Enable gzip compression.
// @see {@link https://github.com/expressjs/compression}
app.use(compress());

// Favicon serving setup.
// @see {@link https://www.npmjs.com/package/serve-favicon}
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// HTTP request logger setup.
// @see {@link https://www.npmjs.com/package/morgan}
app.use(logger('dev'));

// Form body parsing setup.
// @see {@link https://www.npmjs.com/package/body-parser}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Cookie header parsing setup. Populates req.cookies.
// @see {@link https://www.npmjs.com/package/cookie-parser}
app.use(cookieParser());

// Error handling.
// Handle 404 error.
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Handle 500 error.
app.use(function(err, req, res, next) {
  res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

// Initialize server.
let port = parseInt(process.env.PORT || 9000, 10);
app.set('port', port);
let server = http.createServer(app);

// Listen on provided port, on all network interfaces.
server
  .listen(port)
  .on('error', (error) => {
    if (error.syscall !== 'listen') throw error;

    let bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

    // Handle specific listen errors with friendly messages.
    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;

      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;

      default:
        throw error;
    }
  })
  .on('listening', () => {
    let addr = server.address();
    let bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;

    console.log('Listening on ' + bind);
  });


module.exports = app;
