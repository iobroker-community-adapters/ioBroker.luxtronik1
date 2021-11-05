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
var data1100error = 0;
var data1800error = 0;
var data2100error = 0;
var data3405error = 0;
var data3505error = 0;
var data3200error = 0;
var data3400error = 0;
var temperaturen = []; //1100
var eingaenge = []; //1200
var ausgaenge = []; //1300
var ablaufzeiten = []; //1400
var betriebsstunden = [];
var fehlerspeicher = [];
var abschaltungen = [];
var anlstat = [];
var modus = ['AUTO', 'ZWE', 'Party', 'Ferien', 'Aus', 'Aus'];
var data3400array = [];
var data2100array = [];
var data3201array = ['3201', '8']; //BW-Sperre alle Tage
var data2701array = ['2701', '7']; //Datum und Zeit
var hkdata;
var instance;
var errorcount;
var schaltzbwblock = false;
var zeitblock = false;
var clientconnection = false;
var hkfunction = false;
var hystfunction = false;
var pollfunction = false;
var warteauf = "";
var clientconnectionerror = 0;
var lastsetbws;

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

  } else {
    clientconnectionerror = 0;
    pollfunction = true;
    callluxtronik1800();
    setTimeout(callluxtronik2100, 2000);
    setTimeout(callluxtronik3405, 4000);
    setTimeout(callluxtronik3505, 6000);
    setTimeout(callluxtronik3400, 8000);
    setTimeout(callluxtronik3200, 10000);
  }
} //endPollluxtronik

function controlluxtronik(id, state) {
  try {
    switch (id) {
      case "control.BWs":
        adapter.log.debug("Setze Warmwasser-Soll auf: " + state);
        lastsetbws = state * 10;
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

      case "control.HystBWs":
        adapter.log.debug("Setze Hystere Brauchwasser auf: " + state + "°C");
        controlhystbw(state * 10);
        break;

      case "control.HystHKs":
        adapter.log.debug("Setze Hystere Brauchwasser auf: " + state + "°C");
        controlhysthk(state * 10);
        break;

      case "control.SchaltzWoBW.senden":
        adapter.log.debug("Sende Schaltzeiten BW Woche");

        adapter.getState("control.SchaltzWoBW.Start1", function(err, state) {
          if (state) {
            data3201array[2] = Number((state.val).slice(0, 2));
            data3201array[3] = Number((state.val).slice(-2));
            adapter.getState("control.SchaltzWoBW.Ende1", function(err, state) {
              if (state) {
                data3201array[4] = Number((state.val).slice(0, 2));
                data3201array[5] = Number((state.val).slice(-2));
                adapter.getState("control.SchaltzWoBW.Start2", function(err, state) {
                  if (state) {
                    data3201array[6] = Number((state.val).slice(0, 2));
                    data3201array[7] = Number((state.val).slice(-2));
                    adapter.getState("control.SchaltzWoBW.Ende2", function(err, state) {
                      if (state) {
                        data3201array[8] = Number((state.val).slice(0, 2));
                        data3201array[9] = Number((state.val).slice(-2));
                        controlSchaltzWoBW(data3201array);
                      } else {
                        adapterl.log.debug("Fehler beim Auslesen der BW-Schaltzeiten Woche");
                      }
                    });
                  } else {
                    adapterl.log.debug("Fehler beim Auslesen der BW-Schaltzeiten Woche");
                  }
                });
              } else {
                adapterl.log.debug("Fehler beim Auslesen der BW-Schaltzeiten Woche");
              }
            });
          } else {
            adapterl.log.debug("Fehler beim Auslesen der BW-Schaltzeiten Woche");
          }
        });


        break


      case "control.Zeit.senden":
        adapter.log.debug("Sende Zeit und Datum");

        adapter.getState("control.Zeit.datum", function(err, state) {
          if (state) {
            data2701array[2] = Number((state.val).slice(-2));
            data2701array[3] = Number((state.val).slice(3, 5));
            data2701array[4] = Number((state.val).slice(0, 2));
            adapter.getState("control.Zeit.dow", function(err, state) {
              if (state) {
                data2701array[5] = state.val;
                adapter.getState("control.Zeit.uhrzeit", function(err, state) {
                  if (state) {
                    data2701array[6] = Number((state.val).slice(0, 2));
                    data2701array[7] = Number((state.val).slice(3, 5));
                    data2701array[8] = Number((state.val).slice(-2));
                    controlZeit(data2701array);
                  } else {
                    adapterl.log.debug("Fehler beim Auslesen der Zeitfelder");
                  }
                });
              } else {
                adapterl.log.debug("Fehler beim Auslesen der Zeitfelder");
              }
            });
          } else {
            adapterl.log.debug("Fehler beim Auslesen der Zeitfelder");
          }
        });

        break

      default:
        if (id.includes("control.SchaltzWoBW.Start") || id.includes("control.SchaltzWoBW.Ende")) {
          schaltzbwblock = true;
          setTimeout(function() {
            schaltzbwblock = false;
          }, 60000);
        } else if (id.includes("control.Zeit.uhrzeit") || id.includes("control.Zeit.dow") || id.includes("control.Zeit.datum")) {
          zeitblock = true;
          setTimeout(function() {
            zeitblock = false;
          }, 60000);
        }
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



function controlhystbw(statehystbw) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlhystbw(statehystbw);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  hystfunction = true;
  adapter.log.debug("Hysteresefunktion aktiviert");

  callluxtronik2100();
  setTimeout(function() {
    var dataHyst = data2100array;
    dataHyst[0] = 2101;
    dataHyst[9] = statehystbw;
    callluxtronik2101(dataHyst);
  }, 2000);
  setTimeout(callluxtronik2100, 7000);
} //end controlhystbw

function controlhysthk(statehysthk) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlhysthk(statehysthk);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  hystfunction = true;
  adapter.log.debug("Hysteresefunktion aktiviert");

  callluxtronik2100();
  setTimeout(function() {
    var dataHyst = data2100array;
    dataHyst[0] = 2101;
    dataHyst[3] = statehysthk;
    callluxtronik2101(dataHyst);
  }, 2000);
  setTimeout(callluxtronik2100, 7000);
} //end controlhysthk

function controlSchaltzWoBW(data3201array) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlSchaltzWoBW(data3201array);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  schaltzbwblock = false;
  callluxtronik3201(data3201array);
} //end controlSchaltzWoBW

function controlZeit(data2701array) {
  if (clientconnection == true) {
    adapter.log.debug("warte auf " + warteauf);
    clientconnectionerror++;
    if (clientconnectionerror > 10) {
      adapter.log.warn("Verbindungsprobleme, starte Adapter neu");
      restartAdapter();
    }
    setTimeout(function() {
      controlZeit(data2701array);
    }, 1000);
    return;
  }
  clientconnectionerror = 0;
  schaltzbwblock = false;
  callluxtronik2701(data2701array);
} //end controlZeit

function callluxtronik1100() {
  clientconnection = true;
  warteauf = "callluxtronik1100";
  var datacount1100 = 0;
  var client = new net.Socket();
  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('1100\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("1100 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    datacount1100++;
    if (datastring.includes("1100") === true && (datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
      datacount1100 = 0;
      adapter.log.debug("Data1100 complete, destroy connection")
      client.destroy();
    } else if (datacount1100 > 5) {
      datacount1100 = 0;
      adapter.log.debug("Data1100 NOT complete, destroy connection")
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 40) {
        var data1100array = datastring.split(';');

        adapter.log.debug("Anzahl Elemente data1100array: " + data1100array.length);
        adapter.log.debug("Anzahl Elemente data1100array SOLL: " + (parseInt(data1100array[1]) + 2))

        if (data1100array.length === parseInt(data1100array[1]) + 2) {
          adapter.log.debug("Datensatz 1100: " + data1100array);

          if (data1100array[8] != lastsetbws) {
            adapter.log.info("BW-Solltemperatur nicht korrekt gesetzt, Vorgang wird wiederholt");
            data1100error++;
            if (data1100error < 6) {
              controlbws(lastsetbws);
            } else {
              adapter.log.warn("Achtung, Setzen korrekter BW-Solltemperatur mehrmals fehlgeschlagen");
              adapter.log.warn("Adapter wird neu gestartet");
              restartAdapter();
            }
          } else {
            data1100error = 0;
            adapter.setState("temperaturen.AUT", data1100array[6] / 10, true);
            adapter.setState("temperaturen.RL", data1100array[3] / 10, true);
            adapter.setState("temperaturen.VL", data1100array[2] / 10, true);
            adapter.setState("temperaturen.RLs", data1100array[4] / 10, true);
            adapter.setState("temperaturen.HG", data1100array[5] / 10, true);
            adapter.setState("temperaturen.BWi", data1100array[7] / 10, true);
            adapter.setState("temperaturen.BWs", data1100array[8] / 10, true);
            adapter.setState("temperaturen.WQe", data1100array[9] / 10, true);
            adapter.setState("temperaturen.WQa", data1100array[10] / 10, true);
            adapter.setState("temperaturen.MK1VLi", data1100array[11] / 10, true);
            adapter.setState("temperaturen.MK1VLs", data1100array[12] / 10, true);
            adapter.setState("temperaturen.RS", data1100array[13] / 10, true);
          }
        } else {
          adapter.log.debug("Datenarray1100 unvollständig, keine Werte gesetzt");
          data1100error++;
        }
      } else {
        adapter.log.debug("Datensatz1100 unvollständig, keine Werte gesetzt");
        data1100error++;
      }
      if (data1100error > 4) {
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 1100");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik1100 - Fehler: " + e);
    }
    adapter.log.debug("Daten 1100 fertig verarbeitet.")
    clientconnection = false;
  });
} //callluxtronik1100

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

          temperaturen = data1800array[2].split(';'); //1100
          adapter.setState("temperaturen.AUT", temperaturen[6] / 10, true);
          adapter.setState("temperaturen.RL", temperaturen[3] / 10, true);
          adapter.setState("temperaturen.VL", temperaturen[2] / 10, true);
          adapter.setState("temperaturen.RLs", temperaturen[4] / 10, true);
          adapter.setState("temperaturen.HG", temperaturen[5] / 10, true);
          adapter.setState("temperaturen.BWi", temperaturen[7] / 10, true);
          adapter.setState("temperaturen.BWs", temperaturen[8] / 10, true);
          if (pollfunction == true) {
            adapter.setState("control.BWs", temperaturen[8] / 10, true);
          }
          adapter.setState("temperaturen.WQe", temperaturen[9] / 10, true);
          adapter.setState("temperaturen.WQa", temperaturen[10] / 10, true);
          adapter.setState("temperaturen.MK1VLi", temperaturen[11] / 10, true);
          adapter.setState("temperaturen.MK1VLs", temperaturen[12] / 10, true);
          adapter.setState("temperaturen.RS", temperaturen[13] / 10, true);

          eingaenge = data1800array[3].split(';'); //1200
          adapter.setState("eingaenge.ASD", !!+eingaenge[2], true);
          adapter.setState("eingaenge.EVU", !!+eingaenge[3], true);
          adapter.setState("eingaenge.HD", !!+eingaenge[4], true);
          adapter.setState("eingaenge.MOT", !!+eingaenge[5], true);
          adapter.setState("eingaenge.ND", !!+eingaenge[6], true);
          adapter.setState("eingaenge.PEX", !!+eingaenge[7], true);

          ausgaenge = data1800array[4].split(';'); //1300

          var solpu = "Ventilator_Brunnen_oder_Soleumwaelzpumpe";
          adapter.setState("ausgaenge.Abtauventil", !!+ausgaenge[2], true);
          adapter.setState("ausgaenge.Brauchwarmwasserumwaelzpumpe", !!+ausgaenge[3], true);
          adapter.setState("ausgaenge.Fussbodenheizungsumwaelzpumpe", !!+ausgaenge[4], true);
          adapter.setState("ausgaenge.Heizungsumwaelzpumpe", !!+ausgaenge[5], true);
          adapter.setState("ausgaenge.Mischer_1_Auf", !!+ausgaenge[6], true);
          adapter.setState("ausgaenge.Mischer_1_Zu", !!+ausgaenge[7], true);
          adapter.setState("ausgaenge.Ventilation_des_Waermepumpengehaeuses", !!+ausgaenge[8], true);
          adapter.setState("ausgaenge." + solpu, !!+ausgaenge[9], true);
          adapter.setState("ausgaenge.Verdichter_1_in_Waermepumpe", !!+ausgaenge[10], true);
          adapter.setState("ausgaenge.Verdichter_2_in_Waermepumpe", !!+ausgaenge[11], true);
          adapter.setState("ausgaenge.Zusatzumwaelzpumpe_Zirkulationspumpe", !!+ausgaenge[12], true);
          adapter.setState("ausgaenge.Zweiter_Waermeerzeuger_1", !!+ausgaenge[13], true);
          adapter.setState("ausgaenge.Zweiter_Waermeerzeuger_2_Sammelstoerung", !!+ausgaenge[14], true);

          ablaufzeiten = data1800array[5].split(';'); //1400

          adapter.getState('ablaufzeiten.WPseit', function(err, state) {
            if (state) {
              adapter.log.debug("Laufzeit:" + (parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])) + " Vorwert: " + state.val);
              if ((parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])) == 0 && state.val > 0) {
                adapter.setState('ablaufzeiten.WPseitlast', state.val, true);
                adapter.setState("ablaufzeiten.WPseit", (parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])), true);
                adapter.log.debug("neue letzte Laufzeit gesetzt");
              } else if ((parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])) > state.val) {
                adapter.log.debug("WP läuft, WPseitlast wird ersetzt, wenn WP wieder steht");
                adapter.setState("ablaufzeiten.WPseit", (parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])), true);
              } else {
                adapter.log.debug("keine Änderung");
                adapter.setState("ablaufzeiten.WPseit", (parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])), true);
              }
            } else {
              adapterl.log.debug("kein State");
              adapter.setState("ablaufzeiten.WPseit", (parseInt(ablaufzeiten[2]) * 3600 + parseInt(ablaufzeiten[3]) * 60 + parseInt(ablaufzeiten[4])), true);
            }
          });

          adapter.setState("ablaufzeiten.ZWE1seit", (parseInt(ablaufzeiten[5]) * 3600 + parseInt(ablaufzeiten[6]) * 60 + parseInt(ablaufzeiten[7])), true);
          adapter.setState("ablaufzeiten.ZWE2seit", (parseInt(ablaufzeiten[8]) * 3600 + parseInt(ablaufzeiten[9]) * 60 + parseInt(ablaufzeiten[10])), true);
          adapter.setState("ablaufzeiten.Netzeinv", (parseInt(ablaufzeiten[11])), true);
          adapter.setState("ablaufzeiten.SSPstand", (parseInt(ablaufzeiten[12]) * 60 + parseInt(ablaufzeiten[13])), true);
          adapter.setState("ablaufzeiten.SSPverz", (parseInt(ablaufzeiten[14]) * 60 + parseInt(ablaufzeiten[15])), true);
          adapter.setState("ablaufzeiten.VDstand", (parseInt(ablaufzeiten[16]) * 3600 + parseInt(ablaufzeiten[17]) * 60 + parseInt(ablaufzeiten[18])), true);
          adapter.setState("ablaufzeiten.HRM", (parseInt(ablaufzeiten[19]) * 3600 + parseInt(ablaufzeiten[20]) * 60 + parseInt(ablaufzeiten[21])), true);
          adapter.setState("ablaufzeiten.HRW", (parseInt(ablaufzeiten[22]) * 3600 + parseInt(ablaufzeiten[23]) * 60 + parseInt(ablaufzeiten[24])), true);
          adapter.setState("ablaufzeiten.TDIseit", (parseInt(ablaufzeiten[25]) * 3600 + parseInt(ablaufzeiten[26]) * 60 + parseInt(ablaufzeiten[27])), true);
          adapter.setState("ablaufzeiten.BWsperre", (parseInt(ablaufzeiten[28]) * 3600 + parseInt(ablaufzeiten[29]) * 60 + parseInt(ablaufzeiten[30])), true);

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

          adapter.setState("status.WPtyp", String((data1800array[21].split(';'))[2]), true);
          adapter.setState("status.SW", String((data1800array[21].split(';'))[3]), true);
          adapter.setState("status.BivStufe", String((data1800array[21].split(';'))[4]), true);
          adapter.setState("status.ANL", setstatustext(String(data1800array[21])), true);




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
      adapter.log.warn("callluxtronik1800 - Fehler: " + e);
    }
    adapter.log.debug("Daten 1800 fertig verarbeitet.")
    if (pollfunction == false) {
      clientconnection = false;
    }
  });
} //callluxtronik1800


function callluxtronik2100() {
  clientconnection = true;
  warteauf = "callluxtronik2100";
  var datacount2100 = 0;
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('2100\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("2100 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    adapter.log.debug("Datastring: " + datastring);
    datacount2100++;
    if (datastring.includes("2100") === true && (datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
      datacount2100 = 0;
      adapter.log.debug("Data complete, destroy connection")
      client.destroy();
    } else if (datacount2100 > 5) {
      datacount2100 = 0;
      adapter.log.debug("Data2100 NOT complete, destroy connection")
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 10) {
        var data2100array = datastring.split(';');
        adapter.log.debug("Anzahl Elemente data2100array: " + data2100array.length);
        adapter.log.debug("Anzahl Elemente data2100array SOLL: " + (parseInt(data2100array[1]) + 2))
        if (data2100array.length === parseInt(data2100array[1]) + 2) {
          adapter.log.debug("Anzahl Elemente data2100array: " + data2100array.length);
          adapter.log.debug("Datensatz 2100: " + data2100array);

          adapter.setState("temperaturen.einstellungen.RLBegr", data2100array[2] / 10, true);
          adapter.setState("temperaturen.einstellungen.HystHR", data2100array[3] / 10, true);
          if (pollfunction == true) {
            adapter.setState("control.HystHKs", data2100array[3] / 10, true);
          }
          adapter.setState("temperaturen.einstellungen.TRErhMax", data2100array[4] / 10, true);
          adapter.setState("temperaturen.einstellungen.Freig2VD", data2100array[5] / 10, true);
          adapter.setState("temperaturen.einstellungen.FreigZWE", data2100array[6] / 10, true);
          adapter.setState("temperaturen.einstellungen.T-Luftabt", data2100array[7] / 10, true);
          adapter.setState("temperaturen.einstellungen.TDIsoll", data2100array[8] / 10, true);
          adapter.setState("temperaturen.einstellungen.HystBW", data2100array[9] / 10, true);
          if (pollfunction == true) {
            adapter.setState("control.HystBWs", data2100array[9] / 10, true);
          }
          adapter.setState("temperaturen.einstellungen.VL2VDBW", data2100array[10] / 10, true);
          adapter.setState("temperaturen.einstellungen.TAussenMax", data2100array[11] / 10, true);
          adapter.setState("temperaturen.einstellungen.TAussenMin", data2100array[12] / 10, true);
          adapter.setState("temperaturen.einstellungen.TWQMin", data2100array[13] / 10, true);
          adapter.setState("temperaturen.einstellungen.THGMax", data2100array[14] / 10, true);
          adapter.setState("temperaturen.einstellungen.TLAbtEnde", data2100array[15] / 10, true);
          adapter.setState("temperaturen.einstellungen.AbsenkBis", data2100array[16] / 10, true);
          adapter.setState("temperaturen.einstellungen.VLmax", data2100array[17] / 10, true);
          data2100error = 0;
        } else {
          adapter.log.debug("Datenarray2100 unvollständig, keine Werte gesetzt")
          data2100error++;
        }
      } else {
        adapter.log.debug("Datensatz2100 unvollständig, keine Werte gesetzt")
        data2100error++;
      }
      if (data2100error > 4) {
        data2100error = 0;
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 2100");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik2100 - Fehler: " + e);
    }
    adapter.log.debug("Daten 2100 fertig verarbeitet.")

    if (pollfunction == false) {
      clientconnection = false;
    }
  });

} //end callluxtronik2100

function callluxtronik3405() {
  clientconnection = true;
  warteauf = "callluxtronik3405";
  var datacount3405 = 0;
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
    datacount3405++;
    if (datastring.includes("3405") === true && (datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
      datacount3405 = 0;
      adapter.log.debug("Data complete, destroy connection")
      client.destroy();
    } else if (datacount3405 > 5) {
      datacount3405 = 0;
      adapter.log.debug("Data3405 NOT complete, destroy connection")
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 7) {
        var data3405array = datastring.split(';');
        adapter.log.debug("Anzahl Elemente data3405array: " + data3405array.length);
        adapter.log.debug("Anzahl Elemente data3405array SOLL: " + (parseInt(data3405array[1]) + 2))
        if (data3405array.length === parseInt(data3405array[1]) + 2) {
          adapter.log.debug("Datensatz 3405: " + data3405array[2]);
          adapter.log.debug("Modus Heizung: " + modus[parseInt(data3405array[2])]);


          adapter.setState("status.ModusHeizung", parseInt(data3405array[2]), true);
          if (pollfunction == true) {
            adapter.setState("control.ModusHeizung", parseInt(data3405array[2]), true);
          }
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
      adapter.log.warn("callluxtronik3405 - Fehler: " + e);
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
  var datacount3505 = 0;
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
    datacount3505++;
    if (datastring.includes("3505;1") === true && (datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
      datacount3505 = 0;
      adapter.log.debug("Data complete, destroy connection")
      client.destroy();
    } else if (datacount3505 > 5) {
      datacount3505 = 0;
      adapter.log.debug("Data3505 NOT complete, destroy connection")
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 7) {
        var data3505array = datastring.split(';');
        adapter.log.debug("Anzahl Elemente data3505array: " + data3505array.length);
        adapter.log.debug("Anzahl Elemente data3505array SOLL: " + (parseInt(data3505array[1]) + 2));
        if (data3505array.length === parseInt(data3505array[1]) + 2) {
          adapter.log.debug("Datensatz 3505: " + data3505array[2]);
          adapter.log.debug("Modus Warmwasser: " + modus[parseInt(data3505array[2])]);

          adapter.setState("status.ModusWW", parseInt(data3505array[2]), true);
          if (pollfunction == true) {
            adapter.setState("control.ModusWW", parseInt(data3505array[2]), true);
          }
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

function callluxtronik3200() {
  clientconnection = true;
  warteauf = "callluxtronik3200";
  var datacount3200 = 0;
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    client.write('3200\r\n'); // send data to through the client to the host
  });

  client.on('error', function(ex) {
    adapter.log.warn("3200 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    datacount3200++;
    if (datastring.includes("3200;8") === true && (datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
      datacount3200 = 0;
      adapter.log.debug("Data complete, destroy connection")
      client.destroy();
    } else if (datacount3200 > 5) {
      datacount3200 = 0;
      adapter.log.debug("Data3200 NOT complete, destroy connection")
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 15) {
        var data3200array = (datastring.replace(/(\r\n|\n|\r)/gm, "")).split(';');
        adapter.log.debug("Anzahl Elemente datacount3200array: " + data3200array.length);
        adapter.log.debug("Anzahl Elemente data3200array SOLL: " + (parseInt(data3200array[1]) + 2));
        if ((datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
          adapter.log.debug("Datensatz 3200: " + data3200array);
          adapter.log.debug("Schaltzeiten BW Woche: ");
          adapter.log.debug("Start1: " + data3200array[2].padStart(2, '0') + ":" + data3200array[3].padStart(2, '0'));
          adapter.log.debug("Ende1: " + data3200array[4].padStart(2, '0') + ":" + data3200array[5].padStart(2, '0'));
          adapter.log.debug("Start2: " + data3200array[6].padStart(2, '0') + ":" + data3200array[7].padStart(2, '0'));
          adapter.log.debug("Ende2: " + data3200array[8].padStart(2, '0') + ":" + data3200array[9].padStart(2, '0'));
          if (schaltzbwblock == false) {
            adapter.setState("control.SchaltzWoBW.Start1", data3200array[2].padStart(2, '0') + ":" + data3200array[3].padStart(2, '0'), true);
            adapter.setState("control.SchaltzWoBW.Ende1", data3200array[4].padStart(2, '0') + ":" + data3200array[5].padStart(2, '0'), true);
            adapter.setState("control.SchaltzWoBW.Start2", data3200array[6].padStart(2, '0') + ":" + data3200array[7].padStart(2, '0'), true);
            adapter.setState("control.SchaltzWoBW.Ende2", data3200array[8].padStart(2, '0') + ":" + data3200array[9].padStart(2, '0'), true);
          }
          adapter.setState("status.SchaltzWoBW.Start1", data3200array[2].padStart(2, '0') + ":" + data3200array[3].padStart(2, '0'), true);
          adapter.setState("status.SchaltzWoBW.Ende1", data3200array[4].padStart(2, '0') + ":" + data3200array[5].padStart(2, '0'), true);
          adapter.setState("status.SchaltzWoBW.Start2", data3200array[6].padStart(2, '0') + ":" + data3200array[7].padStart(2, '0'), true);
          adapter.setState("status.SchaltzWoBW.Ende2", data3200array[8].padStart(2, '0') + ":" + data3200array[9].padStart(2, '0'), true);

          data3200error = 0;
        } else {
          adapter.log.debug("Datenarray3200 unvollständig, keine Werte gesetzt");
          data3200error++;
        }
      } else {
        adapter.log.debug("Datensatz3200 unvollständig, keine Werte gesetzt");
        data3200error++;
      }
      if (data3400error > 4) {
        adapter.log.warn("Achtung, mehrfach unvollständiger Datensatz 3200");
        adapter.log.warn("Adapter wird neu gestartet");
        restartAdapter();
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3200 - Fehler: " + e);
    }
    adapter.log.debug("Daten 3200 fertig verarbeitet.")

    if (pollfunction == true) {
      pollfunction = false;
      clientconnection = false;
    } else {
      clientconnection = false;
    }


  });
} //endcallluxtronik3200

function callluxtronik3400() {
  clientconnection = true;
  warteauf = "callluxtronik3400";
  var datacount3400 = 0;
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
    datacount3400++;
    if (datastring.includes("3400;9") === true && (datastring.split(';')).length === (parseInt((datastring.split(';'))[1]) + 2)) {
      datacount3400 = 0;
      adapter.log.debug("Data complete, destroy connection")
      client.destroy();
    } else if (datacount3400 > 5) {
      datacount3400 = 0;
      adapter.log.debug("Data3400 NOT complete, destroy connection")
      client.destroy();
    }
  });

  client.on('close', function() {
    adapter.log.debug("Connection closed");
    adapter.log.debug("Datenset: " + datastring);
    adapter.log.debug("Anzahl Elemente Datenset: " + datastring.length);
    try {
      if (datastring.length > 20) {
        var data3400array = datastring.split(';');
        adapter.log.debug("Anzahl Elemente data3400array: " + data3400array.length);
        adapter.log.debug("Anzahl Elemente data3400array SOLL: " + (parseInt(data3400array[1]) + 2));
        if (data3400array.length == 11) {
          adapter.log.debug("Datensatz 3400: " + data3400array);
          adapter.log.debug("Abweichung Rücklauf Soll: " + data3400array[2]);
          adapter.log.debug("Endpunkt: " + data3400array[3]);
          adapter.log.debug("Parallelverschiebung: " + data3400array[4]);
          adapter.log.debug("Nachtabsenkung: " + data3400array[5]);

          adapter.setState("heizkurve.AbwRLs", data3400array[2] / 10, true);
          adapter.setState("heizkurve.Endpunkt", data3400array[3] / 10, true);
          adapter.setState("heizkurve.ParaV", data3400array[4] / 10, true);
          adapter.setState("heizkurve.NachtAbs", data3400array[5] / 10, true);
          if (pollfunction == true) {
            adapter.setState("control.AbwRLs", data3400array[2] / 10, true);
            adapter.setState("control.EndpunktHK", data3400array[3] / 10, true);
            adapter.setState("control.ParaVHK", data3400array[4] / 10, true);
            adapter.setState("control.NachtAbs", data3400array[5] / 10, true);
          }
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
      adapter.log.warn("callluxtronik3400 - Fehler: " + e);
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
      adapter.log.warn("callluxtronik3401 - Fehler: " + e);
    }
    adapter.log.debug("Daten 3401 fertig verarbeitet.");
    clientconnection = false;
  });
} //end callluxtronik3401


function callluxtronik2101(dataHyst) {
  clientconnection = true;
  warteauf = "callluxtronik2101";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    errorcount = 0;
    client.write('2101\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write(dataHyst.toString().replace(/,/g, ';') + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("2101 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('2101\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('2101;0\r\n');
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
        var data2101array = datastring.split('\r\n');
        adapter.log.debug("Heizkurvenwerte neu: " + data2101array);
        if (errorcount == 1) {
          errorcount = 0;
        }
      }
    } catch (e) {
      adapter.log.warn("callluxtronik2101 - Fehler: " + e);
    }
    adapter.log.debug("Daten 2101 fertig verarbeitet.");
    clientconnection = false;
  });
} //end callluxtronik2101




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
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('3406\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('3406;0\r\n');
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


        var data3406array = datastring.split('\r\n');
        adapter.log.debug("Modus Heizung neu: " + data3406array[2].slice(-1));

        adapter.setState("status.ModusHeizung", statemodusheizung, true);
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3406 - Fehler: " + e);
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
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('3506\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('3506;0\r\n');
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
    try {
      adapter.log.debug("Connection closed");
      adapter.log.debug("Datenset: " + datastring);
      if (datastring != "") {
        var data3506array = datastring.split('\r\n');
        adapter.log.debug("Modus Warmwasser neu: " + data3506array[2].slice(-1));

        adapter.setState("status.ModusWW", statemodusww, true);
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3506 - Fehler: " + e);
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
    adapter.log.debug("statebws = " + statebws);

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
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('3501\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('3501;0\r\n');
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

        var data3501array = datastring.split('\r\n');
        adapter.log.debug("data3501array = " + data3501array);


        if (((data3501array[3].split(';'))[2]) == lastsetbws) {
          adapter.log.debug("Warmwasser soll neu: " + ((data3501array[3].split(';'))[2]) / 10);
          adapter.setState("temperaturen.BWs", ((data3501array[3].split(';'))[2]) / 10, true);
          setTimeout(callluxtronik1100, 3000);
        } else {
          adapter.log.debug("BW-Solltemperatur setzen nicht erfolgreich, wird wiederholt");
          controlbws(lastsetbws);
        }
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3501 - Fehler: " + e);
    }
    adapter.log.debug("Daten 3501 fertig verarbeitet.");
    clientconnection = false;
  });
} //endcallluxtronik3501



function callluxtronik3201(data3201array) {
  clientconnection = true;
  warteauf = "callluxtronik3201";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    errorcount = 0;
    client.write('3201\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write(data3201array.toString().replace(/,/g, ';') + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("3201 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('3201\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('3201;0\r\n');
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
        var data3201array = datastring.split('\r\n');
        adapter.log.debug("Schaltzeiten neu: " + data3201array);
        setTimeout(callluxtronik3200, 2000)
        if (errorcount == 1) {
          errorcount = 0;
        }
      }
    } catch (e) {
      adapter.log.warn("callluxtronik3201 - Fehler: " + e);
    }
    adapter.log.debug("Daten 3201 fertig verarbeitet.");
    clientconnection = false;
  });
} //end callluxtronik3201


function callluxtronik2701(data2701array) {
  clientconnection = true;
  warteauf = "callluxtronik2701";
  var client = new net.Socket();

  var client = client.connect(port, deviceIpAdress, function() {
    // write out connection details
    adapter.log.debug('Connected to Luxtronik');
    datastring = "";
    errorcount = 0;
    client.write('2701\r\n'); // send data to through the client to the host
    setTimeout(function() {
      client.write(data2701array.toString().replace(/,/g, ';') + '\r\n');
    }, 2000);
    setTimeout(function() {
      client.write('999\r\n');
    }, 4000);
  });

  client.on('error', function(ex) {
    adapter.log.warn("2701 connection error: " + ex);
  });

  client.on('data', function(data) {
    datastring += data;
    try {
      if (datastring.includes("779") === true && errorcount == 0) {
        errorcount = 1;
        adapter.log.warn("Befehlsverarbeitung 2701 unvollständig, bitte nochmal starten");
        adapter.log.warn("Kommunikationsstörung wird behoben gestartet");

        client.write('2701\r\n'); // send data to through the client to the host
        setTimeout(function() {
          client.write('2701;0\r\n');
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
        var data2701array = datastring.split('\r\n');
        adapter.log.debug("Zeit und Datum neu: " + data2701array);
        //setTimeout(callluxtronik3200, 2000)
        if (errorcount == 1) {
          errorcount = 0;
        }
      }
    } catch (e) {
      adapter.log.warn("callluxtronik2701 - Fehler: " + e);
    }
    adapter.log.debug("Daten 2701 fertig verarbeitet.");
    clientconnection = false;
  });
} //end callluxtronik2701

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
    adapter.log.warn("setfehlertext - Fehler: " + e);
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
    adapter.log.warn("setabschalttext - Fehler: " + e);
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
      case "2":
        statusa = "Schwimmbad";
        break;
      case "3":
        statusa = "EVU-Sperre";
        break;
      case "5":
        statusa = "Bereitschaft";
        break;
      case "4":
        statusa = "Abtauen";
        break;
      default:
        statusa = "Status unklar";
    }
    return statusa;
  } catch (e) {
    adapter.log.warn("statusa - Fehler: " + e);
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
    adapter.log.warn("toTimeString - Fehler: " + e);
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
