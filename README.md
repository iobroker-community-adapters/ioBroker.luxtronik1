![Logo](admin/luxtronik1.png)

# ioBroker.luxtronik1

![Number of Installations](http://iobroker.live/badges/luxtronik1-installed.svg) ![Number of Installations](http://iobroker.live/badges/luxtronik1-stable.svg) [![NPM version](http://img.shields.io/npm/v/iobroker.luxtronik1.svg)](https://www.npmjs.com/package/iobroker.luxtronik1)
[![Downloads](https://img.shields.io/npm/dm/iobroker.luxtronik1.svg)](https://www.npmjs.com/package/iobroker.luxtronik1)

[![NPM](https://nodei.co/npm/iobroker.luxtronik1.png?downloads=true)](https://nodei.co/npm/iobroker.luxtronik1/)

An ioBroker adapter for Luxtronik 1 - heatpump - controllers (i.e. Alpha Innotec, Siemens...)

Install adapter, create instance.
Install hardware: i.e. RS232 to LAN adapter to the serial interface (RS232) of the heatpumps mainbord.
Specs: serial cabe: link PINS 2, 3 and 5  (if it does not work, change pins 2 and 3)
RS232 to LAN converter: i.e. USR TCP232 – 302.
Settings serial interface : 57600/8/N/1 , Mode :TCP-Server
Reset Timeout:0

Set luxtronik - IP-adress, port and polling - intervall

Tested on luxtronik 1 and AlphaInnotec heatpump

Reads different values and stats of your heatpump (temperatures, errors, running time,...).
Controls Luxtronik 1 by setting values in the 'control' - channel. Controls the following values:

-   Hotwater - temperature setting
-   Heating - mode
-   Hot water - mode
-   Heating - curve (difference, endpoint, startingpoint, nightly reduction).
-   Hysteresis hot water
-   Hysteresis heating

Values in the 'control' - channel have to be set with ack=false to trigger an action.

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### 0.4.2 (2024-11-08)

-   (forelleblau) testing and dependencies updated

### 0.4.1 (2024-04-18)

-   (mcm1957) Workflow has been fixed

### 0.4.0 (2024-04-18)

-   (mcm1957) Adapter requires node.js >= 18 and js-controller >= 5 now
-   (mcm1957) Dependencies have been updated

### 0.3.6

-   testing and dependencies updated

### 0.3.5

-   set ready for js-controller 4.0

### 0.3.4

-   control timer hot water added

### 0.3.3

-   data exchange optimized

### 0.3.2

-   bugfix

### 0.3.1

-   bugfixes related to js-controller update (3.3x)

### 0.3.0

-   info on temperature - settings and hysteresis - control added

### 0.2.7

-   status-info added.

### 0.2.6

-   input-data and timers (Eingänge & Ablaufzeiten) added.

### 0.2.5

-   outlet-data added by @pingus01.

### 0.2.4

-   comm-errors fixed, 'control'-values are updated now.

### 0.2.3

-   adapter - restart in case of connection - problems added.

### 0.2.2

-   .npmignore and .gitignore added, small bugfix.

### 0.2.1

-   Readme / License update.

### 0.2.0

-   missing temperature values added, displays now all available temperature values.

### 0.1.0

-   error-handling on communication errors optimized, adapter restart in case of multiple communication errors.

### 0.0.7

-   error-handling on connections added.

### 0.0.6

-   diminished risk of multiple connection, small bugfixes

### 0.0.5

-   controls hotwater-temperature, heating- & hotwater - mode and heating-curve setting.

### 0.0.4

-   error - handling optimized

### 0.0.3

-   Reads mode heating, water and heating-curve

### 0.0.2

-   First published version

### 0.0.1

-   In development stage

## License

The MIT License (MIT)

Copyright (c) 2024 iobroker-community-adapters <mailto:iobroker-community-adapters@gmx.de>
Copyright (c) 2018-2023 forelleblau marceladam@gmx.ch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
