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
var data1800error = 0;
var data3405error = 0;
var data3505error = 0;
var data3400error = 0;
var temperaturen = [];
var betriebsstunden = [];
var fehlerspeicher = [];
var abschaltungen = [];
var anlstat = [];
var modus = ['AUTO', 'ZWE', 'Party', 'Ferien', 'Aus', 'Aus'];
var data3400array = [];
var hkdata;
var instance;
var errorcount;
var clientconnection = false;
var hkfunction = false;
var pollfunction = false;
var warteauf = "";
var clientconnectionerror = 0;

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
      clearTimeout(polling);
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
    try {
      adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));
      //adapter.log.debug("Adapter=" + adapter.toString());

      if (!id || state.ack) return; // Ignore acknowledged state changes or error states
      instance = id.substring(0, adapter.namespace.length);
      adapter.log.debug("Instanz: " + instance);
      id = id.substring(adapter.namespace.length + 1); // remove instance name and id
      state = state.val;
      adapter.log.debug("id=" + id);

      controlluxtronik(id, state);


      // you can use the ack flag to detect if it is status (true) or command (false)
      if (state && !state.ack) {
        adapter.log.info('ack is not set!');
      }
    } catch (e) {
      adapter.log.debug("Fehler Befehlsauswertung: " + e);
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
      instance = adapter.namespace.toString()
      adapter.log.debug("Instanz " + instance + " gestartet");
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

  pollluxtronik();

  if (!polling) {
    polling = setTimeout(function repeat() { // poll states every [30] seconds
      pollluxtronik(); //DATAREQUEST;
      setTimeout(repeat, pollingTime);
    }, pollingTime);
  } // endIf

  // all states changes inside the adapters namespace are subscribed
  adapter.subscribeStates('*');

} // endMain

function pollluxtronik() {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 3) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    adapter.log.debug("Daten werden mit nächstem Polling gelesen");
    //setTimeout(pollluxtronik, 5000);
    return;
  }
  clientconnectionerror = 0;
  pollfunction = true;
  callluxtronik1800();
  setTimeout(callluxtronik3405, 2000);
  setTimeout(callluxtronik3505, 4000);
  setTimeout(callluxtronik3400, 6000);
} //endPollluxtronik

function controlluxtronik(id, state) {
  try {
    switch (id) {
      case "control.BWs":
        adapter.log.debug("Setze Warmwasser-Soll auf: " + state);
        controlbws(state * 10);
        break;

      case "control.ModusWW":
        adapter.log.debug("Setze Modus Warmwasser auf: " + modus[state]);
        controlmodusww(state);
        break;

      case "control.ModusHeizung":
        adapter.log.debug("Setze Modus Heizung auf: " + modus[state]);
        controlmodusheizung(state);
        break;

      case "control.NachtAbs":
        adapter.log.debug("Setze Nachtabsenkung auf: " + state + "°C");
        controlnachtabs(state * 10);
        break;

      case "control.ParaVHK":
        adapter.log.debug("Setze Parallelverschiebung Heizkurve auf: " + state + "°C");
        controlparavhk(state * 10);
        break;

      case "control.EndpunktHK":
        adapter.log.debug("Setze Endpunkt Heizkurve auf: " + state + "°C");
        controlendpunkthk(state * 10);
        break;

      case "control.AbwRLs":
        adapter.log.debug("Setze Abweichung Rücklauf SOLL auf: " + state + "°C");
        controlabwrls(state * 10);

        break;
    }
  } catch (e) {
    adapter.log.warn("controlluxtronik-Fehler: " + e)
  }
} //end controlluxtronik

function controlbws(statebws) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlbws(statebws);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  callluxtronik3501(statebws);
} //end controlbws

function controlmodusww(statemodusww) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlmodusww(statemodusww);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  callluxtronik3506(statemodusww);
} //end controlmodusww

function controlmodusheizung(statemodusheizung) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlmodusheizung(statemodusheizung);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  callluxtronik3406(statemodusheizung);
} //end controlmodusheizung

function controlabwrls(stateabwrls) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlabwrls(stateabwrls);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  hkfunction = true;
  adapter.log.debug("Heizkurvenfunktion aktiviert");

  callluxtronik3400();

  setTimeout(function() {
    var dataHK = data3400array;
    dataHK[0] = 3401;
    dataHK[2] = stateabwrls;
    callluxtronik3401(dataHK);
  }, 2000);
  setTimeout(callluxtronik3400, 7000);
} //end controlabwrls

function controlnachtabs(statenachtabs) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlnachtabs(statenachtabs);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  hkfunction = true;
  adapter.log.debug("Heizkurvenfunktion aktiviert");
  callluxtronik3400();
  setTimeout(function() {
    var dataHK = data3400array;
    dataHK[0] = 3401;
    dataHK[5] = statenachtabs;
    callluxtronik3401(dataHK);
  }, 2000);
  setTimeout(callluxtronik3400, 7000);
} //end controlnachtabs

function controlparavhk(stateparavhk) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlparavhk(stateparavhk);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  hkfunction = true;
  adapter.log.debug("Heizkurvenfunktion aktiviert");

  callluxtronik3400();
  setTimeout(function() {
    var dataHK = data3400array;
    dataHK[0] = 3401;
    dataHK[4] = stateparavhk;
    callluxtronik3401(dataHK);
  }, 2000);
  setTimeout(callluxtronik3400, 7000);
} //end controlparavhk

function controlendpunkthk(stateendpunkthk) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlendpunkthk(stateendpunkthk);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  hkfunction = true;
  adapter.log.debug("Heizkurvenfunktion aktiviert");

  callluxtronik3400();
  setTimeout(function() {
    var dataHK = data3400array;
    dataHK[0] = 3401;
    dataHK[3] = stateendpunkthk;
    callluxtronik3401(dataHK);
  }, 2000);
  setTimeout(callluxtronik3400, 7000);
} //end controlendpunkthk

function callluxtronik1800() {
  clientconnection = true;
  warteauf = "callluxtronik1800";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('1800\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("1800 connection error: " + ex);
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
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 500) {
        data1800array = datastring.split('\r\n');
        adapter.log.debug("Datensatz 1800: " + data1800array);
        adapter.log.debug("Anzahl Elemente data1800array: " + data1800array.length);
        if (data1800array.length > 21) {

          temperaturen = data1800array[2].split(';');
          adapter.setState("temperaturen.AUT", temperaturen[6] / 10, true);
          adapter.setState("temperaturen.RL", temperaturen[3] / 10, true);
          adapter.setState("temperaturen.VL", temperaturen[2] / 10, true);
          adapter.setState("temperaturen.RLs", temperaturen[4] / 10, true);
          adapter.setState("temperaturen.HG", temperaturen[5] / 10, true);
          adapter.setState("temperaturen.BWi", temperaturen[7] / 10, true);
          adapter.setState("temperaturen.BWs", temperaturen[8] / 10, true);
          adapter.setState("temperaturen.WQe", temperaturen[9] / 10, true);
          adapter.setState("temperaturen.WQa", temperaturen[10] / 10, true);
          adapter.setState("temperaturen.MK1VLi", temperaturen[11] / 10, true);
          adapter.setState("temperaturen.MK1VLs", temperaturen[12] / 10, true);
          adapter.setState("temperaturen.RS", temperaturen[13] / 10, true);

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
          adapter.log.debug("BWP" + toTimeString(betriebsstunden[10]) + "hhhh");


          for (var i = 1; i < 6; i++) {
            adapter.setState("fehler." + (6 - i), setfehlertext(data1800array[7 + i]), true);
          }
          for (var i = 1; i < 6; i++) {
            adapter.setState("abschaltungen." + (6 - i), setabschalttext(data1800array[14 + i]), true);
          }

          adapter.setState("status.ANL", setstatustext(data1800array[21]), true);
          data1800error = 0;
        } else {
          adapter.log.debug("Datenarray1800 unvollständig, keine Werte gesetzt");
          data1800error++;
        }
      } else {
        adapter.log.debug("Datensatz1800 unvollständig, keine Werte gesetzt");
        data1800error++;
      }
      if (data1800error > 4) {
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 1800");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik1800 - Feher: " + e);
    }
    adapter.log.debug("Daten 1800 fertig verarbeitet.")
    if (pollfunction == false) {
      clientconnection = false;
    }
  });
} //callluxtronik1800

function callluxtronik3405() {
  clientconnection = true;
  warteauf = "callluxtronik3405";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3405\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("3405 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    if (datastring.includes("3405;1") === true) {
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 10) {
        var data3405array = datastring.split(';');
        if (data3405array.length == 3) {
          adapter.log.debug("Anzahl Elemente data3405array: " + data3405array.length);
          adapter.log.debug("Datensatz 3405: " + data3405array[2]);
          adapter.log.debug("Modus Heizung: " + modus[parseInt(data3405array[2])]);


          adapter.setState("status.ModusHeizung", parseInt(data3405array[2]), true);
          data3405error = 0;
        } else {
          adapter.log.debug("Datenarray3405 unvollständig, keine Werte gesetzt")
          data3405error++;
        }
      } else {
        adapter.log.debug("Datensatz3405 unvollständig, keine Werte gesetzt")
        data3405error++;
      }
      if (data3405error > 4) {
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 3405");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3405 - Feher: " + e);
    }
    adapter.log.debug("Daten 3405 fertig verarbeitet.")

    if (pollfunction == false) {
      clientconnection = false;
    }
  });
} //endcallluxtronik3405

function callluxtronik3505() {
  clientconnection = true;
  warteauf = "callluxtronik3505";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3505\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("3505 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    if (datastring.includes("3505;1") === true) {
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 10) {
        var data3505array = datastring.split(';');
        if (data3505array.length == 3) {
          adapter.log.debug("Datensatz 3505: " + data3505array[2]);
          adapter.log.debug("Modus Warmwasser: " + modus[parseInt(data3505array[2])]);

          adapter.setState("status.ModusWW", parseInt(data3505array[2]), true);
          data3505error = 0;
        } else {
          adapter.log.debug("Datenarray3505 unvollständig, keine Werte gesetzt");
          data3505error++;
        }
      } else {
        adapter.log.debug("Datensatz3505 unvollständig, keine Werte gesetzt");
        data3505error++;
      }
      if (data3505error > 4) {
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 3505");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3505 - Fehler: " + e);
    }
    adapter.log.debug("Daten 3505 fertig verarbeitet.")
    if (pollfunction == false) {
      clientconnection = false;
    }
  });
} //endcallluxtronik3505

function callluxtronik3400() {
  clientconnection = true;
  warteauf = "callluxtronik3400";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3400\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("3400 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    adapter.log.debug("Datastringlänge: " + datastring.length)
    if (datastring.includes("3400;9") === true && datastring.length > 40) {
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 20) {
        data3400array = datastring.split(';');

        adapter.log.debug("Datensatz 3400: " + data3400array);
        adapter.log.debug("Anzahl Elemente Datensatz3400: " + data3400array.length);
        if (data3400array.length == 11) {

          adapter.log.debug("Abweichung Rücklauf Soll: " + data3400array[2]);
          adapter.log.debug("Endpunkt: " + data3400array[3]);
          adapter.log.debug("Parallelverschiebung: " + data3400array[4]);
          adapter.log.debug("Nachtabsenkung: " + data3400array[5]);

          adapter.setState("heizkurve.AbwRLs", data3400array[2] / 10, true);
          adapter.setState("heizkurve.Endpunkt", data3400array[3] / 10, true);
          adapter.setState("heizkurve.ParaV", data3400array[4] / 10, true);
          adapter.setState("heizkurve.NachtAbs", data3400array[5] / 10, true);
          data3400error = 0;
        } else {
          adapter.log.debug("Datenarray3400 unvollständig, keine Werte gesetzt");
          data3400error++;
        }
      } else {
        adapter.log.debug("Datensatz3400 unvollständig, keine Werte gesetzt");
        data3400error++;
      }
      if (data3400error > 4) {
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 3400");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3400 - Feher: " + e);
    }
    adapter.log.debug("Daten 3400 fertig verarbeitet.")
    if (hkfunction == true) {
      hkfunction = false;
      adapter.log.debug("Heizkurvenfunktion beendet");

    } else {
      clientconnection = false;
    }
    if (pollfunction == true) {
      pollfunction = false;
      clientconnection = false;
    }
  });
} //endcallluxtronik3400

function callluxtronik3401(hkdata) {
  clientconnection = true;
  warteauf = "callluxtronik3401";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    errorcount = 0;
    client.write('3401\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write(hkdata.toString().replace(/,/g, ';') + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("3401 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('3401\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('3401;0\r\n');
        }, 100);
        setTimeout(function() {
          client.write('999\r\n');

        }, 200);

      }

      if (datastring.includes("993\r\n999") === true) {
        client.destroy();
      }
    } catch (e) {
      adapter.log.debug("Fehler Störungsbehebung " + e);
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {

      if (datastring != "") {
        var data3401array = datastring.split('\r\n');
        adapter.log.debug("Heizkurvenwerte neu: " + data3401array);
        if (errorcount == 1) {
          errorcount = 0;
        }
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3401 - Feher: " + e);
    }
    adapter.log.debug("Daten 3401 fertig verarbeitet.");
    clientconnection = false;
  });
} //end callluxtronik3401

function callluxtronik3406(statemodusheizung) {
  clientconnection = true;
  warteauf = "callluxtronik3406";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3406\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write('3406;1;' + statemodusheizung + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("3406 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    if (datastring.includes("993\r\n999") === true) {
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring != "") {


        var data3406array = datastring.split('\r\n');
        adapter.log.debug("Modus Heizung neu: " + data3406array[2].slice(-1));

        adapter.setState("status.ModusHeizung", statemodusheizung, true);
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3406 - Feher: " + e);
    }
    adapter.log.debug("Daten 3406 fertig verarbeitet.")
    clientconnection = false;
  });
} //endcallluxtronik3406

function callluxtronik3506(statemodusww) {
  clientconnection = true;
  warteauf = "callluxtronik3506";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3506\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write('3506;1;' + statemodusww + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("3406 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    if (datastring.includes("993\r\n999") === true) {
      client.destroy();
    }
  });

  client.on('close', function() {
    try {
      adapter.log.debug("Connection closed");
      adapter.log.debug("Datenset: " + datastring);
      if (datastring != "") {
        var data3506array = datastring.split('\r\n');
        adapter.log.debug("Modus Warmwasser neu: " + data3506array[2].slice(-1));

        adapter.setState("status.ModusWW", statemodusww, true);
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3506 - Feher: " + e);
    }
    adapter.log.debug("Daten 3506 fertig verarbeitet.")
    clientconnection = false;
  });
} //endcallluxtronik3506

function callluxtronik3501(statebws) {
  clientconnection = true;
  warteauf = "callluxtronik3501";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3501\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write('3501;1;' + statebws + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("3501 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    if (datastring.includes("993\r\n999") === true) {
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring != "") {

        var data3501array = datastring.split('\r\n');
        adapter.log.debug("Warmwasser soll neu: " + data3501array[2].slice(7, 9));

        adapter.setState("temperaturen.BWs", statebws / 10, true);

      }
    } catch (e) {
      adapter.log.warn("callluxtronik3501 - Feher: " + e);
    }
    adapter.log.debug("Daten 3501 fertig verarbeitet.")
    clientconnection = false;
  });
} //endcallluxtronik3501

function setfehlertext(fehlerinfo) {
  try {
    var fehlerarray = fehlerinfo.split(';');
    var fehlercode = fehlerarray[3];
    var fehlerzeit = ('00' + fehlerarray[4]).slice(-2) + "." + ('00' + fehlerarray[5]).slice(-2) + "." + ('00' + fehlerarray[6]).slice(-2) + ", " + ('00' + fehlerarray[7]).slice(-2) + ":" + ('00' + fehlerarray[8]).slice(-2);
    var errorcodes = {
      "11": "kein Fehler",
      "701": "Niederdruckstörung",
      "702": "Niederdrucksperre",
      "703": "Frostschutz",
      "704": "Heissgasstörung",
      "705": "Motorschutz VEN",
      "706": "",
      "707": "Codierung WP",
      "708": "Fühler Rücklauf",
      "709": "Fühler Vorlauf",
      "710": "Fühler Heissgas",
      "711": "Fühler Aussentemp.",
      "712": "Fühler Brauchwasser",
      "713": "Fühler WQ-Ein",
      "714": "Heissgas BW",
      "715": "Hochdruck-Abschalt.",
      "716": "Hochdruckstörung",
      "717": "Durchfluss-WQ",
      "718": "Max. Aussentemp.",
      "719": "Min. Aussentemp.",
      "720": "WQ-Temperatur",
      "721": "Niederdruckabschaltung",
      "722": "Tempdiff Heizwasser",
      "723": "Tempdiff Brauchw.",
      "724": "Tempdiff Abtauen",
      "725": "Anlagefehler BW",
      "726": "Fühler Mischkreis 1",
      "727": "Soledruck",
      "728": "Fühler WQ-Aus",
      "729": "Drehfeldfehler",
      "730": "Leistung Ausheizen",
      "731": "",
      "732": "Störung Kühlung",
      "733": "Störung Anode",
      "734": "Störung Anode",
      "735": "Fühler Ext. En",
      "736": "Fühler Solarkollektor",
      "737": "Fühler Solarspeicher",
      "738": "Fühler Mischkreis2",
      "739": "CAN-Fehler: WP fehlt",
      "740": "CAN-Fehler: Timeout",
      "741": "CAN-Fehler: Bus off",
      "742": "CAN-Fehler: Daten",
      "743": "CAN-Fehler: Adresse",
      "744": "",
      "745": "Modem-Fehler"
    };

    var fehlercodetext = errorcodes[fehlercode];
    var fehlertext = fehlercodetext + " " + fehlerzeit;
    return fehlertext;
  } catch (e) {
    adapter.log.warn("setfehlertext - Feher: " + e);
  }
} //end setfehlertext

function setabschalttext(abschaltinfo) {
  try {
    var abschaltarray = abschaltinfo.split(';');
    var abschaltcode = abschaltarray[3];
    var abschaltzeit = ('00' + abschaltarray[4]).slice(-2) + "." + ('00' + abschaltarray[5]).slice(-2) + "." + ('00' + abschaltarray[6]).slice(-2) + ", " + ('00' + abschaltarray[7]).slice(-2) + ":" + ('00' + abschaltarray[8]).slice(-2);
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
    var abschalttext = abschaltcodetext + " " + abschaltzeit;
    return abschalttext;
  } catch (e) {
    adapter.log.warn("setabschalttext - Feher: " + e);
  }
} //end setabschalttext

function setstatustext(statuscode) {
  var statusa;
  try {
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
  } catch (e) {
    adapter.log.warn("statusa - Feher: " + e);
  }
} //end setstatustext

function toTimeString(totalseconds) {
  try {
    var totalNumberOfSeconds = totalseconds;
    var hours = parseInt(totalNumberOfSeconds / 3600);
    var minutes = parseInt((totalNumberOfSeconds - (hours * 3600)) / 60);
    var seconds = Math.floor((totalNumberOfSeconds - ((hours * 3600) + (minutes * 60))));
    var result = (hours < 10 ? "0" + hours : hours) + "h " + (minutes < 10 ? "0" + minutes : minutes) + "min " + (seconds < 10 ? "0" + seconds : seconds) + "s";
    return result;
  } catch (e) {
    adapter.log.warn("toTimeString - Feher: " + e);
  }
} //end toTimeString

function restartAdapter() {
  adapter.getForeignObject('system.adapter.' + adapter.namespace, (err, obj) => {
    if (obj) adapter.setForeignObject('system.adapter.' + adapter.namespace, obj);
  });
} // endFunctionRestartAdapter

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
  module.exports = startAdapter;
} else {
  // or start the instance directly
  startAdapter();
} // endElse
