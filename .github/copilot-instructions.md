# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context
- **Adapter Name**: iobroker.luxtronik1
- **Primary Function**: Interface for Luxtronik 1 heat pump controllers (Alpha Innotec, Siemens, etc.)
- **Communication Protocol**: TCP/IP over RS232-to-LAN converter
- **Hardware Interface**: Serial communication to heat pump mainboard (57600/8/N/1)
- **Key Features**: Temperature monitoring, operating mode control, error reporting, statistics collection
- **Target Devices**: Luxtronik 1 controllers with RS232 interface
- **Network Setup**: TCP server mode on RS232-to-LAN converter (e.g., USR TCP232-302)

## Heat Pump Controller Specific Patterns

### TCP Communication Patterns
```javascript
// TCP connection with proper error handling
const net = require('net');
let client = new net.Socket();

client.connect(port, deviceIpAddress, () => {
    this.log.info('Connected to heat pump controller');
    // Send command to heat pump
});

client.on('data', (data) => {
    // Parse heat pump response data
    this.parseHeatPumpData(data);
});

client.on('error', (err) => {
    this.log.error('Heat pump connection error: ' + err);
    this.setState('info.connection', false, true);
});
```

### Heat Pump Data Structures
```javascript
// Common data arrays for Luxtronik 1
const temperaturen = []; // 1100 - Temperature values
const eingaenge = [];    // 1200 - Inputs
const ausgaenge = [];    // 1300 - Outputs
const ablaufzeiten = []; // 1400 - Runtime data
const betriebsstunden = []; // Operating hours
const fehlerspeicher = []; // Error memory
const abschaltungen = []; // Shutdowns
const anlstat = []; // System status

// Operating modes
const modus = ['AUTO', 'ZWE', 'Party', 'Ferien', 'Aus', 'Aus'];
```

### Error Handling for Hardware Communication
```javascript
// Handle communication errors with retry logic
handleCommunicationError(error, operation) {
    this.errorcount++;
    this.log.warn(`Heat pump ${operation} error (${this.errorcount}): ${error}`);
    
    if (this.errorcount > 5) {
        this.log.error('Too many communication errors, stopping adapter');
        this.setState('info.connection', false, true);
        return false;
    }
    
    // Retry after delay
    setTimeout(() => {
        this.retryOperation(operation);
    }, 5000);
    
    return true;
}
```

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Validate that states have been created
                        const states = await harness.states.getKeysAsync('your-adapter.0.*');
                        console.log(`Found ${states.length} states created by adapter`);
                        
                        // Test basic functionality
                        expect(states.length).to.be.greaterThan(0);
                        
                        console.log('✅ Integration test completed successfully');
                        resolve();
                        
                    } catch (error) {
                        console.error('❌ Integration test failed:', error);
                        reject(error);
                    }
                });
            }).timeout(60000);
        });
    }
});
```

### Hardware-Specific Test Patterns

For heat pump controllers that require physical hardware, create mock test scenarios:

```javascript
// Mock TCP server for testing
const mockHeatPumpServer = require('net').createServer();
mockHeatPumpServer.listen(8888, 'localhost', () => {
    console.log('Mock heat pump server started on localhost:8888');
});

mockHeatPumpServer.on('connection', (socket) => {
    // Simulate heat pump responses
    socket.on('data', (data) => {
        const command = data.toString();
        if (command.includes('1100')) {
            // Send mock temperature data
            socket.write('mock_temperature_response');
        }
    });
});
```

## Error Handling and Logging

### Heat Pump Communication Errors
```javascript
// Specific error handling for heat pump communication
handleHeatPumpError(errorType, details) {
    switch(errorType) {
        case 'CONNECTION_TIMEOUT':
            this.log.warn(`Heat pump connection timeout: ${details}`);
            this.setState('info.connection', false, true);
            break;
        case 'DATA_PARSE_ERROR':
            this.log.error(`Failed to parse heat pump data: ${details}`);
            break;
        case 'INVALID_RESPONSE':
            this.log.warn(`Invalid response from heat pump: ${details}`);
            break;
        default:
            this.log.error(`Unknown heat pump error: ${errorType} - ${details}`);
    }
}
```

### Logging Best Practices
```javascript
// Use appropriate log levels for heat pump operations
this.log.debug('Sending command to heat pump: ' + command);
this.log.info('Heat pump data updated successfully');
this.log.warn('Heat pump reported warning condition');
this.log.error('Critical heat pump communication failure');
```

## Configuration Management

### Heat Pump Connection Settings
```javascript
// Validate heat pump connection configuration
validateConfig() {
    if (!this.config.deviceIp) {
        this.log.error('Heat pump IP address not configured');
        return false;
    }
    
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
        this.log.error('Invalid heat pump port configuration');
        return false;
    }
    
    if (!this.config.pollInterval || this.config.pollInterval < 30) {
        this.log.warn('Poll interval too short, setting to 30 seconds minimum');
        this.config.pollInterval = 30;
    }
    
    return true;
}
```

## State Management

### Heat Pump State Structure
```javascript
// Create heat pump specific state objects
createHeatPumpStates() {
    // Temperature states
    this.setObjectNotExists('temperatures.outside', {
        type: 'state',
        common: {
            name: 'Outside Temperature',
            type: 'number',
            role: 'value.temperature',
            unit: '°C',
            read: true,
            write: false
        },
        native: {}
    });
    
    // Operating mode control
    this.setObjectNotExists('control.mode', {
        type: 'state',
        common: {
            name: 'Operating Mode',
            type: 'number',
            role: 'level',
            min: 0,
            max: 5,
            read: true,
            write: true,
            states: {
                0: 'AUTO',
                1: 'ZWE',
                2: 'Party',
                3: 'Ferien',
                4: 'Aus',
                5: 'Aus'
            }
        },
        native: {}
    });
}
```

## Adapter Lifecycle Management

### Proper Resource Cleanup
```javascript
// Clean shutdown for heat pump adapter
unload(callback) {
    try {
        // Stop polling
        if (this.polling) {
            clearInterval(this.polling);
            this.polling = null;
        }
        
        // Close TCP connection
        if (this.client && !this.client.destroyed) {
            this.client.end();
            this.client.destroy();
        }
        
        // Clear connection timers
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }
        
        this.log.info('Heat pump adapter stopped cleanly');
        callback();
    } catch (e) {
        this.log.error('Error during adapter shutdown: ' + e);
        callback();
    }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```