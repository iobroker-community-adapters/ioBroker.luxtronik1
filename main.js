/**
 * luxtronik1 adapter
 */

/* jshint -W097 */ // jshint strict:false
/*jslint node: true */
'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils
const adapter = new utils.Adapter('luxtronik1');
var deviceIpAdress;
var port;
var net = require('net');
var hexout = [];
var buffarr = [];
var buff;
var cmdi;

var calli = 0;

let polling;


// when adapter shuts down
adapter.on('unload', function(callback) {
  try {
    clearInterval(polling);
    adapter.log.info('[END] Stopping luxtronik adapter...');
    adapter.setState('info.connection', false, true);
    callback();
  } catch (e) {
    callback();
  }
});

// is called if a subscribed object changes
adapter.on('objectChange', function(id, obj) {
  // Warning, obj can be null if it was deleted
  adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function(id, state) {
  // Warning, state can be null if it was deleted
  adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

  // you can use the ack flag to detect if it is status (true) or command (false)
  if (state && !state.ack) {
    adapter.log.info('ack is not set!');
  }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function(obj) {
  if (typeof obj === 'object' && obj.message) {
    if (obj.command === 'send') {
      // e.g. send email or pushover or whatever
      adapter.log('send command');

      // Send response in callback if required
      if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    }
  }
});

// is called when databases are connected and adapter received configuration.
adapter.on('ready', function() {
  if (adapter.config.host) {
    adapter.log.info('[START] Starting luxtronik adapter');
    adapter.setState('info.connection', true, true);
    main();
  } else adapter.log.warn('[START] No IP-address set');
});


function main() {
  // Vars
  deviceIpAdress = adapter.config.host;
  port = adapter.config.port;


  const pollingTime = adapter.config.pollInterval || 300000;
  adapter.log.debug('[INFO] Configured polling interval: ' + pollingTime);
  adapter.log.debug('[START] Started Adapter with: ' + adapter.config.host);

  callval = setInterval(callvalues, 2000);

  if (!polling) {
    polling = setTimeout(function repeat() { // poll states every [30] seconds
      callval = setInterval(callvalues, 2000); //DATAREQUEST;
      setTimeout(repeat, pollingTime);
    }, pollingTime);
  } // endIf

  // all states changes inside the adapters namespace are subscribed
  adapter.subscribeStates('*');

} // endMain

function callvalues() {
  hexout = statcmdi[calli];
  adapter.log.debug(hexout);
  call1800(hexout);
  calli++;
  if (calli == statcmdL) {
    clearInterval(callval);
  }
} //end callvalues


function call1800(out) {
  var client = new net.Socket();
  client.connect(port, host, function() { //Connection Data ComfoAir
    adapter.log.debug('Connected');

    client.write(out);
  });

  client.on('data', function(data) {

      client.destroy(); // kill client after server's response
      read1800data(data);
      });

client.on('close', function() {
  adapter.log.debug('Connection closed');
});
} //end callcomfoair
