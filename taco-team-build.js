/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
// Module dependencies
var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    glob = require('glob'),
    semver = require('semver'),
    tu = require('./lib/ttb-util.js'),
    tc = require('./lib/ttb-cache.js'),
    exec = Q.nfbind(require('child_process').exec);

// Constants
var SUPPORT_PLUGIN_PATH = path.resolve(__dirname, 'cordova-plugin-vs-taco-support'),
    SUPPORT_PLUGIN_ID = 'cordova-plugin-vs-taco-support';

// Global vars
var defaultConfig = {
        projectPath: process.cwd(),
        addSupportPlugin: true,
        nodePackageName: tc.CORDOVA,
        moduleVersion: undefined
    };

// Method to set options
function configure(cfg) {
    defaultConfig = tu.parseConfig(cfg, defaultConfig);
}

// Gets and/or downloads the appropriate cordova node module for use based on options or taco.json
// Also installs support plugin if not already in the project
function setupCordova(cfg) {
    cfg = tu.parseConfig(cfg, defaultConfig);
    
    // Check if Cordova already loaded
    var cdv = tc.getLoadedModule(cfg);
    if(cdv) return Q(cdv);

    return tc.cacheModule(cfg).then(function(result) {
            process.chdir(cfg.projectPath);
            cfg.moduleVersion = result.version;
            return tc.loadModule(result.path);
        });
}

function addSupportPluginIfRequested(cachedModule, cfg) {
    if (cachedModule.cordova) {
        cachedModule = cachedModule.cordova;
    }
    
    // Unless the user very specifically asked to not get it, we should add the support plugin
    var addSupportPlugin = cfg.addSupportPlugin !== false;
    if (addSupportPlugin && cfg.projectPath && !tu.fileExistsSync(path.join(cfg.projectPath, 'plugins', SUPPORT_PLUGIN_ID))) {
        process.chdir(cfg.projectPath);
        console.log('Adding support plugin.');
        return cachedModule.raw.plugin('add', SUPPORT_PLUGIN_PATH).then(function () { return cachedModule; });
    }
    
    return Q(cachedModule);
}

// It's possible that checking in the platforms folder on Windows and then checking out and building
// the project on OSX can cause the eXecution bit on the platform version files to be cleared,
// resulting in errors when performing project operations. This method restores it if needed.
function applyExecutionBitFix(platforms) {
    // Only bother if we're on OSX and are after platform add for iOS itself (still need to run for other platforms)
    if (process.platform !=="darwin") {
        return;
    }

    // Generate the script to set execute bits for installed platforms
    var script ="";
    platforms.forEach(function(platform) {
        script += "find -E platforms/" + platform + "/cordova -type f -regex \"[^.(LICENSE)]*\" -exec chmod +x {} +\n"
    });
    
    // Run script
    return exec(script, function(err, stderr, stdout) {
        if(stderr) console.error(stderr);
        if(stdout) console.log(stdout);
    });
}

// Main build method
function buildProject(cordovaPlatforms, args, /* optional */ projectPath) {
    if (typeof (cordovaPlatforms) == 'string') {
        cordovaPlatforms = [cordovaPlatforms];
    }
    
    if(!projectPath) {
        projectPath = defaultConfig.projectPath;
    }

    return setupCordova().then(function(cordova) {
            return applyExecutionBitFix(cordovaPlatforms).then(function() { return Q(cordova); });
        }).then(function(cordova) {
            return addSupportPluginIfRequested(cordova, defaultConfig);
        }).then(function (cordova) {
        // Add platforms if not done already
        var promise = _addPlatformsToProject(cordovaPlatforms, projectPath, cordova);
        //Build each platform with args in args object
        cordovaPlatforms.forEach(function (platform) {
            promise = promise.then(function () {
                // Build app with platform specific args if specified
                var callArgs = tu.getCallArgs(platform, args);
                console.log('Queueing build for platform ' + platform + ' w/options: ' + callArgs.options || 'none');
                return cordova.raw.build(callArgs);
            });
        });
        
        return promise;
    });
}

// Prep for build by adding platforms and setting environment variables
function _addPlatformsToProject(cordovaPlatforms, projectPath, cordova) {
    var promise = Q();
    cordovaPlatforms.forEach(function (platform) {
        if (!tu.fileExistsSync(path.join(projectPath, 'platforms', platform))) {
            promise = promise.then(function () { return cordova.raw.platform('add', platform); });
        } else {
            console.log('Platform ' + platform + ' already added.');
        }
    });
    
    return promise;
}

// Package project method - Just for iOS currently
function packageProject(cordovaPlatforms, args, /* optional */ projectPath) {
    if (typeof (cordovaPlatforms) == 'string') {
        cordovaPlatforms = [cordovaPlatforms];
    }
    if(!projectPath) {
        projectPath = defaultConfig.projectPath;
    }

    return setupCordova().then(function (cordova) {
        var promise = Q(cordova);
        cordovaPlatforms.forEach(function (platform) {
            if (platform == 'ios') {
                promise = promise.then(function() { return _createIpa(projectPath, args); });
            } else {
                console.log('Platform ' + platform + ' does not require a separate package step.');
            }
        });
        
        return promise;
    });
}

// Find the .app folder and use exec to call xcrun with the appropriate set of args
function _createIpa(projectPath, args) {
    
    return tu.getInstalledPlatformVersion(projectPath, 'ios').then(function(version) {        
        if(semver.lt(version, '3.9.0')) {
            var deferred = Q.defer();
            glob(projectPath + '/platforms/ios/build/device/*.app', function (err, matches) {
                if (err) {
                    deferred.reject(err);
                } else {
                    if (matches.length != 1) {
                        console.warn( 'Skipping packaging. Expected one device .app - found ' + matches.length);
                    } else {
                        var cmdString = 'xcrun -sdk iphoneos PackageApplication \'' + matches[0] + '\' -o \'' +
                            path.join(path.dirname(matches[0]), path.basename(matches[0], '.app')) + '.ipa\' ';
                        
                        // Add additional command line args passed 
                        var callArgs = tu.getCallArgs('ios', args);
                        callArgs.options.forEach(function (arg) {
                            cmdString += ' ' + arg;
                        });
        
                        console.log('Exec: ' + cmdString);
                        return exec(cmdString)
                            .then(tu.handleExecReturn)
                            .fail(function(err) {
                                deferred.reject(err);
                            })
                            .done(function() {
                                deferred.resolve();
                            });
                    }
                }
            });
            
            return deferred.promise;
        } else {
            console.log('Skipping packaging. Detected cordova-ios verison that auto-creates ipa.');
        }
    });
}

// Public methods
module.exports = {
    configure: configure,
    setupCordova: setupCordova,
    buildProject: buildProject,
    packageProject: packageProject,
    getInstalledPlatformVersion: tu.getInstalledPlatformVersion,
    getVersionForNpmPackage: tu.getVersionForNpmPackage,
    cacheModule: function(cfg) {
        cfg = tu.parseConfig(cfg, defaultConfig);
        return tc.cacheModule(cfg);
    }
};
