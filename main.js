/**
 * luxtronik1 adapter
 */

/* jshint -W097 */ // jshint strict:false
/*jslint node: true */
'use strict';

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
let adapter;
var deviceIpAdress;
var port;
var net = require('net');
var datastring = "";
var data1800array = [];
var temperaturen = [];
var betriebsstunden = [];
var fehlerspeicher = [];
var abschaltungen = [];
var anlstat = [];

let polling;

function startAdapter(options) {
  options = options || {};
  Object.assign(options, {
    name: 'luxtronik1'
  });

  adapter = new utils.Adapter(options);

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

  return adapter;
} // endStartAdapter

function main() {
  // Vars
  deviceIpAdress = adapter.config.host;
  port = adapter.config.port;


  const pollingTime = adapter.config.pollInterval || 300000;
  adapter.log.debug('[INFO] Configured polling interval: ' + pollingTime);
  adapter.log.debug('[START] Started Adapter with: ' + adapter.config.host);

  callluxtronik1800();

  if (!polling) {
    polling = setTimeout(function repeat() { // poll states every [30] seconds
      callluxtronik1800(); //DATAREQUEST;
      setTimeout(repeat, pollingTime);
    }, pollingTime);
  } // endIf

  // all states changes inside the adapters namespace are subscribed
  adapter.subscribeStates('*');

} // endMain




function callluxtronik1800() {
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('1800\r\n'); // send data to through the client to the host
  });

  client.on('data', function(data) {
    datastring += data;
    if (datastring.includes("1800;8", 10) === true) {
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    data1800array = datastring.split('\r\n');
    adapter.log.debug("Datensatz 1800: " + data1800array);

    temperaturen = data1800array[2].split(';');
    adapter.setState("temperaturen.AUT", temperaturen[6] / 10, true);
    adapter.setState("temperaturen.RL", temperaturen[3] / 10, true);
    adapter.setState("temperaturen.VL", temperaturen[2] / 10, true);
    adapter.setState("temperaturen.RLs", temperaturen[4] / 10, true);
    adapter.setState("temperaturen.HG", temperaturen[5] / 10, true);
    adapter.setState("temperaturen.BWi", temperaturen[7] / 10, true);
    adapter.setState("temperaturen.BWs", temperaturen[8] / 10, true);

    betriebsstunden = data1800array[6].split(';');
    adapter.setState("betriebsstunden.VD1", toTimeString(betriebsstunden[2]), true);
    adapter.setState("betriebsstunden.Imp1", betriebsstunden[3], true);
    adapter.setState("betriebsstunden.AvVD1", toTimeString(betriebsstunden[4]), true);
    adapter.setState("betriebsstunden.VD2", toTimeString(betriebsstunden[5]), true);
    adapter.setState("betriebsstunden.Imp2", betriebsstunden[6], true);
    adapter.setState("betriebsstunden.AvVD2", toTimeString(betriebsstunden[7]), true);
    adapter.setState("betriebsstunden.ZWE1", toTimeString(betriebsstunden[8]), true);
    adapter.setState("betriebsstunden.ZWE2", toTimeString(betriebsstunden[9]), true);
    adapter.setState("betriebsstunden.WP", toTimeString(betriebsstunden[10]), true);
adapter.log.debug("BWP"+toTimeString(betriebsstunden[10])+"hhhh");


    for (var i = 1; i < 6; i++) {
      adapter.setState("fehler." + i, setfehlertext(data1800array[7 + i]), true);
    }
    for (var i = 1; i < 6; i++) {
      adapter.setState("abschaltungen." + i, setabschalttext(data1800array[14 + i]), true);
    }

    adapter.setState("status.ANL", setstatustext(data1800array[21]), true);

    adapter.log.debug("Daten 1800 fertig verarbeitet.")
  });
} //callluxtronik1800

function setfehlertext(fehlerinfo) {
  var fehlerarray = fehlerinfo.split(';');
  var fehlercode = fehlerarray[3];
  var fehlerzeit = fehlerarray[4] + "." + fehlerarray[5] + ", " + fehlerarray[6] + ":" + fehlerarray[7] + ":" + fehlerarray[8];
  var fehlercodetext;
  switch (fehlercode) {
    case "11":
      fehlercodetext = "kein Fehler, ";
      break;
    default:
      fehlercodetext = fehlercode;
  }
  var fehlertext = fehlercodetext + fehlerzeit;
  return fehlertext;
} //end setfehlertext

function setabschalttext(abschaltinfo) {
  var abschaltarray = abschaltinfo.split(';');
  var abschaltcode = abschaltarray[3];
  var abschaltzeit = abschaltarray[4] + "." + abschaltarray[5] + ", " + abschaltarray[6] + ":" + abschaltarray[7] + ":" + abschaltarray[8];
  var abschaltcodetext;
  switch (abschaltcode) {
    case "010":
      abschaltcodetext = "weniger Waerme, ";
      break;
    case "001":
      abschaltcodetext = "Waermepumpenstoerung, ";
      break;
    case "002":
      abschaltcodetext = "Anlagenstoerung, ";
      break;
  }
  var abschalttext = abschaltcodetext + abschaltzeit;
  return abschalttext;
} //end setabschalttext

function setstatustext(statuscode) {
  var statusa;
  switch ((statuscode.split(';'))[5]) {
    case "0":
      statusa = "Heizung";
      break;
    case "1":
      statusa = "Warmwasser";
      break;
    case "5":
      statusa = "Bereitschaft";
      break;
    case "4":
      statusa = "Abtauen";
      break;
  }
  return statusa;
} //end setstatustext

function toTimeString(totalseconds) {
  var totalNumberOfSeconds = totalseconds;
  var hours = parseInt(totalNumberOfSeconds / 3600);
  var minutes = parseInt((totalNumberOfSeconds - (hours * 3600)) / 60);
  var seconds = Math.floor((totalNumberOfSeconds - ((hours * 3600) + (minutes * 60))));
  var result = (hours < 10 ? "0" + hours : hours) + "h " + (minutes < 10 ? "0" + minutes : minutes) + "min " + (seconds < 10 ? "0" + seconds : seconds) + "s";
  return result;
} //end toTimeString

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
} // endElse
