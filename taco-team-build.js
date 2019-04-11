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
    utilities = require('./lib/ttb-util.js'),
    cache = require('./lib/ttb-cache.js'),
    exec = Q.nfbind(require('child_process').exec);

// Constants
var SUPPORT_PLUGIN_ID = 'cordova-plugin-vs-taco-support',
    SUPPORT_PLUGIN_GIT_URL = 'https://github.com/Microsoft/cordova-plugin-vs-taco-support.git';

// Global vars
var defaultConfig = {
    projectPath: process.cwd(),
    addSupportPlugin: true,
    nodePackageName: cache.CORDOVA,
    moduleVersion: undefined
};

// Method to set options
function configure(config) {
    defaultConfig = utilities.parseConfig(config, defaultConfig);
}

// Gets and/or downloads the appropriate cordova node module for use based on options or taco.json
// Also installs support plugin if not already in the project
function setupCordova(config) {
    config = utilities.parseConfig(config, defaultConfig);
    
    // Check if Cordova already loaded
    var cdv = cache.getLoadedModule(config);
    if (cdv) return Q(cdv);

    return cache.cacheModule(config).then(function (result) {
        process.chdir(config.projectPath);
        config.moduleVersion = result.version;
        return cache.loadModule(result.path);
    });
}

function addSupportPluginIfRequested(cachedModule, config) {
    if (cachedModule.cordova) {
        cachedModule = cachedModule.cordova;
    }
    
    // Unless the user very specifically asked to not get it, we should add the support plugin
    var addSupportPlugin = config.addSupportPlugin !== false;
    if (addSupportPlugin && config.projectPath && !utilities.fileExistsSync(path.join(config.projectPath, 'plugins', SUPPORT_PLUGIN_ID))) {
        process.chdir(config.projectPath);
        console.log('Adding support plugin.');

        return getNpmVersionFromConfig(config).then(function (effectiveVersion) {
            var pluginTarget = SUPPORT_PLUGIN_ID;
            if (semver.valid(effectiveVersion) && semver.lt(effectiveVersion, '5.0.0')) {
                // Older versions can't install from npm, so install via git
                pluginTarget = SUPPORT_PLUGIN_GIT_URL;
            }

            return cachedModule.raw.plugin('add', pluginTarget).then(function () { return cachedModule; });
        });
    }

    return Q(cachedModule);
}

function getNpmVersionFromConfig(config) {
    var version = cache.getModuleVersionFromConfig(config);
    return utilities.getVersionForNpmPackage(config.nodePackageName + (version ? ('@' + version) : ''));
}

// It's possible that checking in the platforms folder on Windows and then checking out and building
// the project on OSX can cause the eXecution bit on the platform version files to be cleared,
// resulting in errors when performing project operations. This method restores it if needed.
// It will also set the excute bit on the hooks directory and all shell scripts in the project
function applyExecutionBitFix(platforms) {
    // Only bother if we're on OSX and are after platform add for iOS itself (still need to run for other platforms)
    if (process.platform !== "darwin" && process.platform !== 'linux') {
        return Q();
    }

    // Disable -E flag for non-OSX platforms
    var regex_flag = process.platform == 'darwin' ? '-E' : '';
    
    // Generate the script to set execute bits for installed platforms
    var script = "";
    platforms.forEach(function (platform) {
        var platformCordovaDir = "platforms/" + platform + "/cordova";

        if (utilities.fileExistsSync(platformCordovaDir)) {
            script += "find " + regex_flag + " " + platformCordovaDir + " -type f -regex \"[^.(LICENSE)]*\" -exec chmod +x {} +\n";
        }
    });

    var hooksCordovaDir = "hooks";
    if (utilities.fileExistsSync(hooksCordovaDir)) {
        script += "find " + regex_flag + " " + hooksCordovaDir + " -type f -exec chmod +x {} +\n";
    }

    script += "find " + regex_flag + " . -name '*.sh' -type f -exec chmod +x {} +\n";
    
    // Run script
    return exec(script);
}

function checkIfXcodeAboveVersion8() {
    var cmd = 'xcodebuild -version';
    var execDeferred = Q.defer();
    exec(cmd, function(err, stdout, stderr) {
        if (err) {
            execDeferred.reject(err);
        } else {
            execDeferred.resolve(stdout.toString());
        }
    });

    return execDeferred.promise.then(function(execOutput) {
        // parse the output here
        var xcodeVersionRegex = /^Xcode (\d+(\.\d+)?)/;
        var match = execOutput.match(xcodeVersionRegex);
        if (match && match[1]) {
            if (parseInt(match[1], 10) >= 8) {
                return Q(true);
            } else {
                return Q(false);
            }
        }
    });
}

function ensureProjectXcode8Compatibility(projectPath, platform, callArgs) {
    // if platform is not ios, skip
    if (platform !== 'ios') { return Q(); }
    return checkIfXcodeAboveVersion8().then(function(shouldCheck) {
        if (shouldCheck == true) {
            // check cordova ios version
            var cordovaIosVersionPath = path.join(projectPath, 'platforms', 'ios', 'cordova', 'version');
            var cordovaIosVersion;
            try {
                cordovaIosVersion = require(cordovaIosVersionPath);
            }
            catch (e) {
                throw new Error('Cannot determine cordova-ios version.');
            }

            if (cordovaIosVersion && semver.lt(cordovaIosVersion.version, '4.3.0')) {
                throw new Error('Your cordova-ios version is ' + cordovaIosVersion.version + '. Xcode8 requires cordova-ios 4.3.0 or above. Please update.');
            }

            // check build.json existence
            var buildJsonPath = path.join(projectPath, 'build.json');
            var buildJson;
            try {
                buildJson = require(buildJsonPath);
            }
            catch (e) {
                throw new Error('Please specify a build.json file according to https://taco.visualstudio.com/en-us/docs/vs-taco-2017-ios-guide/#xcode8');
            }

            // check developmentTeam existence
            var argsString = _getArgsString(callArgs.options).toString().toLowerCase();
            // find out configuration
            var config = (argsString.indexOf('debug') > -1) ? 'debug' : 'release';
            if (!buildJson.ios || !buildJson.ios[config] || !buildJson.ios[config].developmentTeam) {
                throw new Error('Please specify developmentTeam in build.json according to https://taco.visualstudio.com/en-us/docs/vs-taco-2017-ios-guide/#xcode8');
            }

            return Q();
        }
    });
}

// Method to prepare the platforms
function prepareProject(cordovaPlatforms, args, /* optional */ projectPath) {
    if (typeof (cordovaPlatforms) == "string") {
        cordovaPlatforms = [cordovaPlatforms];
    }

    if (!projectPath) {
        projectPath = defaultConfig.projectPath;
    }

    var appendedVersion = cache.getModuleVersionFromConfig(defaultConfig);
    if (appendedVersion) {
        appendedVersion = '@' + appendedVersion;
    } else {
        appendedVersion = '';
    }

    return utilities.isCompatibleNpmPackage(defaultConfig.nodePackageName + appendedVersion).then(function (compatibilityResult) {
        switch (compatibilityResult) {
            case utilities.NodeCompatibilityResult.IncompatibleVersion4Ios:
                throw new Error('This Cordova version does not support Node.js 4.0.0 for iOS builds. Either downgrade to an earlier version of Node.js or move to Cordova 5.3.3 or later. See http://go.microsoft.com/fwlink/?LinkID=618471');
            case utilities.NodeCompatibilityResult.IncompatibleVersion5:
                throw new Error('This Cordova version does not support Node.js 5.0.0 or later. Either downgrade to an earlier version of Node.js or move to Cordova 5.4.0 or later. See http://go.microsoft.com/fwlink/?LinkID=618471');
        }

        return setupCordova();
    }).then(function (cordova) {
        return addSupportPluginIfRequested(cordova, defaultConfig);
    }).then(function (cordova) {
        // Add platforms if not done already
        var promise = _addPlatformsToProject(cordovaPlatforms, projectPath, cordova);
        //Build each platform with args in args object
        cordovaPlatforms.forEach(function (platform) {
            promise = promise.then(function () {
                // Build app with platform specific args if specified
                var callArgs = utilities.getCallArgs(platform, args);
                var argsString = _getArgsString(callArgs.options);
                console.log('Queueing prepare for platform ' + platform + ' w/options: ' + argsString);
                return cordova.prepare(callArgs);
            });
        });

        return promise;
    });
}

// Main build method
function buildProject(cordovaPlatforms, args, /* optional */ projectPath) {
    if (typeof (cordovaPlatforms) == 'string') {
        cordovaPlatforms = [cordovaPlatforms];
    }

    if (!projectPath) {
        projectPath = defaultConfig.projectPath;
    }

    var appendedVersion = cache.getModuleVersionFromConfig(defaultConfig);
    if (appendedVersion) {
        appendedVersion = '@' + appendedVersion;
    } else {
        appendedVersion = '';
    }

    var cordovaVersion = defaultConfig.moduleVersion;
    return utilities.isCompatibleNpmPackage(defaultConfig.nodePackageName + appendedVersion).then(function (compatibilityResult) {
        switch (compatibilityResult) {
            case utilities.NodeCompatibilityResult.IncompatibleVersion4Ios:
                throw new Error('This Cordova version does not support Node.js 4.0.0 for iOS builds. Either downgrade to an earlier version of Node.js or move to Cordova 5.3.3 or later. See http://go.microsoft.com/fwlink/?LinkID=618471');
            case utilities.NodeCompatibilityResult.IncompatibleVersion5:
                throw new Error('This Cordova version does not support Node.js 5.0.0 or later. Either downgrade to an earlier version of Node.js or move to Cordova 5.4.0 or later. See http://go.microsoft.com/fwlink/?LinkID=618471');
        }

        return utilities.getVersionForNpmPackage(defaultConfig.nodePackageName + appendedVersion);
    }).then(function (version) {
        cordovaVersion = version;
        return setupCordova();
    }).then(function (cordova) {
        return applyExecutionBitFix(cordovaPlatforms).then(function () {
            return Q(cordova);
        }, function (err) {
                return Q(cordova);
            });
    }).then(function (cordova) {
        return addSupportPluginIfRequested(cordova, defaultConfig);
    }).then(function (cordova) {
        // Add platforms if not done already
        var promise = _addPlatformsToProject(cordovaPlatforms, projectPath, cordova);
        //Build each platform with args in args object
        cordovaPlatforms.forEach(function (platform) {
            promise = promise.then(function () {
                // Build app with platform specific args if specified
                var callArgs = utilities.getCallArgs(platform, args, cordovaVersion);
                return ensureProjectXcode8Compatibility(projectPath, platform, callArgs);
            }).then(function() {
                var callArgs = utilities.getCallArgs(platform, args, cordovaVersion);
                var argsString = _getArgsString(callArgs.options);
                console.log('Queueing build for platform ' + platform + ' w/options: ' + argsString);
                return cordova.build(callArgs);
            });
        });

        return promise;
    });
}

function _getArgsString(options) {
    if (!options) {
        return 'none';
    }

    return options.argv || options;
}

// Prep for build by adding platforms and setting environment variables
function _addPlatformsToProject(cordovaPlatforms, projectPath, cordova) {
    var promise = Q();
    cordovaPlatforms.forEach(function (platform) {
        console.log('this is a test')
        if (!utilities.fileExistsSync(path.join(projectPath, 'platforms', platform))) {
            promise = promise.then(function () { return cordova.platform('add', platform); });
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
    if (!projectPath) {
        projectPath = defaultConfig.projectPath;
    }

    return setupCordova().then(function (cordova) {
        var promise = Q(cordova);
        cordovaPlatforms.forEach(function (platform) {
            if (platform == 'ios') {
                promise = promise.then(function () { return _createIpa(projectPath, args); });
            } else {
                console.log('Platform ' + platform + ' does not require a separate package step.');
            }
        });

        return promise;
    });
}

// Find the .app folder and use exec to call xcrun with the appropriate set of args
function _createIpa(projectPath, args) {

    return utilities.getInstalledPlatformVersion(projectPath, 'ios').then(function (version) {
        if (semver.lt(version, '3.9.0')) {
            var deferred = Q.defer();
            glob(projectPath + '/platforms/ios/build/device/*.app', function (err, matches) {
                if (err) {
                    deferred.reject(err);
                } else {
                    if (matches.length != 1) {
                        console.warn('Skipping packaging. Expected one device .app - found ' + matches.length);
                    } else {
                        var cmdString = 'xcrun -sdk iphoneos PackageApplication \'' + matches[0] + '\' -o \'' +
                            path.join(path.dirname(matches[0]), path.basename(matches[0], '.app')) + '.ipa\' ';
                        
                        // Add additional command line args passed 
                        var callArgs = utilities.getCallArgs('ios', args);
                        callArgs.options.forEach(function (arg) {
                            cmdString += ' ' + arg;
                        });

                        console.log('Exec: ' + cmdString);
                        return exec(cmdString)
                            .then(utilities.handleExecReturn)
                            .fail(function (err) {
                            deferred.reject(err);
                        })
                            .done(function () {
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
    prepareProject: prepareProject,
    buildProject: buildProject,
    packageProject: packageProject,
    getInstalledPlatformVersion: utilities.getInstalledPlatformVersion,
    getVersionForNpmPackage: utilities.getVersionForNpmPackage,
    getNpmVersionFromConfig: getNpmVersionFromConfig,
    cacheModule: function (config) {
        process.env["CI"]=true;
        config = utilities.parseConfig(config, defaultConfig);
        return cache.cacheModule(config);
    }
};
