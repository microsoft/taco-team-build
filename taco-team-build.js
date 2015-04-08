/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
// Constants
var DEFAULT_CORDOVA_VERSION = "4.3.0",
    // Support plugin adds in two VS features: Task Runner Explorer event bindings and res/native 
    SUPPORT_PLUGIN = "https://github.com/Chuxel/taco-cordova-support-plugin.git",
    SUPPORT_PLUGIN_ID = "com.microsoft.visualstudio.taco",
    // cordova-lib is technically what we want to use g cordova.raw gives us. We are using 
    // the "cordova" package to get to it since version numbers do not match the CLI < v3.7.0.  
    // Ex: 3.6.3-0.2.13 does not match cordova-lib's version
    CORDOVA_LIB = "cordova";

// Module dependencies
var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    glob = require("glob"),
    exec = Q.nfbind(require('child_process').exec);

// Global vars
var cordovaCache = process.env["CORDOVA_CACHE"] || path.resolve("_cordova"),
    projectPath = process.cwd(),
    cordovaVersion,
    loadedCordovaVersion,
    cdv;

// Method to set options
function configure(obj) {
    if (obj.cordovaCache !== undefined) cordovaCache = obj.cordovaCache;
    if (obj.cordovaVersion !== undefined) cordovaVersion = obj.cordovaVersion;
    if (obj.projectPath !== undefined) projectPath = obj.projectPath;
}

// Gets and/or downloads the appropriate cordova node module for use based on options or taco.json
// Also installs support plugin if not already in the project
function setupCordova(obj) {
    if (obj !== undefined) {
        configure(obj);
    }

    // Check if Cordova already loaded
    if (cdv && cordovaVersion === loadedCordovaVersion) {
        return Q(cdv);
    }

    // If no version is set, try to get the version from taco.json
    if (cordovaVersion === undefined) {
        if (fs.existsSync(path.join(projectPath, "taco.json"))) {
            cordovaVersion = require(path.join(projectPath, "taco.json"))["cordova-cli"];
            console.log("Cordova version set to " + cordovaVersion + " based on the contents of taco.json");
        } else {
            cordovaVersion = DEFAULT_CORDOVA_VERSION;
            console.log("taco.json not found. Using default Cordova version of " + cordovaVersion);
        }
    }

    // Check if the specified version of Cordova is available in a local cache and install it if not 
    // Uses "CORDOVA_CACHE" environment variable or just adds a _cordova folder in the project path as a temporary build artifact
    if (!fs.existsSync(cordovaCache)) {
        fs.mkdirSync(cordovaCache);
        console.log("Creating " + cordovaCache);
    }
    console.log("Cordova cache found at " + cordovaCache);

    // Install correct cordova version if not available
    var cordovaModulePath = path.resolve(path.join(cordovaCache, cordovaVersion));
    if (!fs.existsSync(cordovaModulePath)) {
        fs.mkdirSync(cordovaModulePath);
        fs.mkdirSync(path.join(cordovaModulePath, "node_modules"));
        console.log("Installing Cordova " + cordovaVersion + ".");

        return exec("npm install " + CORDOVA_LIB + "@" + cordovaVersion, { cwd: cordovaModulePath })
            .then(handleExecReturn).then(getCordova);
    } else {
        console.log("Cordova " + cordovaVersion + " already installed.");
        return getCordova();
    }
}

// Main build method
function buildProject(cordovaPlatforms, args) {
    if (typeof (cordovaPlatforms) == "string") {
        cordovaPlatforms = [cordovaPlatforms];
    }

    return setupCordova().then(function (cordova) {
        // Add platforms if not done already
        var promise = addPlatformsToProject(cordova, cordovaPlatforms);
        //Build each platform with args in args object
        cordovaPlatforms.forEach(function (platform) {
            promise = promise.then(function () {
                // Build app with platform specific args if specified
                var callArgs = getCallArgs(platform, args);
                console.log("Queueing build for platform " + callArgs.platform + " w/options: " + callArgs.options || "none");
                return cordova.raw.build(callArgs);
            });
        });
        return promise;
    });
}

// Prep for build by adding platforms and setting environment variables
function addPlatformsToProject(cordova, cordovaPlatforms) {
    var promise = Q();
    cordovaPlatforms.forEach(function (platform) {
        if (!fs.existsSync(path.join(projectPath, "platforms", platform))) {
            console.log("Adding platform " + platform + "...");
            promise = promise.then(function () { return cordova.raw.platform('add', platform); });
        } else {
            console.log("Platform " + platform + " already added.");
        }
    });
    return promise;
}

// Package project method - Just for iOS currently
function packageProject(cordovaPlatforms, args) {
    if (typeof (cordovaPlatforms) == "string") {
        cordovaPlatforms = [cordovaPlatforms];
    }

    return setupCordova().then(function (cordova) {
        var promise = Q(cordova);
        cordovaPlatforms.forEach(function (platform) {
            if (platform == "ios") {
                promise = promise.then(function() { return createIpa(args); })
            } else {
                console.log("Platform " + platform + " does not require a separate package step.");
            }
        });
        return promise;
    });
}

// Find the .app folder and use exec to call xcrun with the appropriate set of args
function createIpa(args) {
    glob(projectPath + "/platforms/ios/build/device/*.app", function (err, matches) {
        if (err) {
            throw err;
        } else {
            if (matches.length != 1) {
                throw "Expected only one .app - found " + matches.length;
            } else {
                promise = promise.then(function () {
                    var cmdString = "xcrun -v -sdk iphoneos PackageApplication \"" + matches[0] + "\" -o \"" +
                        path.join(path.dirname(matches[0]), path.basename(matches[0], ".app")) + ".ipa\" ";
                    
                    // Add additional command line args passed 
                    var callArgs = getCallArgs(platform, args);
                    callArgs.options.forEach(function (arg) {
                        cmdString += " " + arg;
                    });

                    console.log("Exec: " + cmdString);
                    return exec(cmdString).then(handleExecReturn);
                });
            }
        }
    });
}

// Utility method that "requires" the correct version of cordova-lib, adds in the support plugin if not present, sets CORDOVA_HOME 
function getCordova() {
    // Setup environment
    if (cdv === undefined || loadedCordovaVersion != cordovaVersion) {
        loadedCordovaVersion = cordovaVersion;
        process.chdir(projectPath);
        process.env["CORDOVA_HOME"] = cordovaCache; // Set platforms to cache in cache locaiton to avoid unexpected results
        cdv = require(path.join(cordovaCache, cordovaVersion, "node_modules", CORDOVA_LIB));
        // Install VS support plugin if not already present
        if(!fs.existsSync(path.join(projectPath, "plugins", SUPPORT_PLUGIN_ID))) {
            console.log("Adding support plugin.")
            return cdv.raw.plugin("add", SUPPORT_PLUGIN).then(function() { return cdv; });
        } else {
            console.log("Support plugin already added.")
        }
    }
    return Q(cdv);
}

// Utility method that coverts args into a consistant input understood by cordova-lib
function getCallArgs(platforms, args) {
    // Processes single platform string (or array of length 1) and an array of args or an object of args per platform
    args = args || [];
    if (typeof (platforms) == "string") {
        platforms = [platforms];
    }
    // If only one platform is specified, check if the args is an object and use the args for this platform if so
    if (platforms.length == 1) {
        if (args instanceof Array) {
            return { platforms: platforms, options: args }
        } else {
            return { platforms: platforms, options: args[platforms[0]] }
        }
    }
}

// Utility method to handle the return of exec calls - namely to send output to stdout / stderr
function handleExecReturn(result) {
    console.log("Exec complete.");
    console.log(result[0]);
    if (result[1] != "") {
        console.error(result[1]);
    }
}

// Recusive copy function for res/native processing
function copyFiles(srcPath, destPath) {
    if (fs.statSync(srcPath).isDirectory()) {
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath);
        }
        fs.readdirSync(srcPath).forEach(function (child) {
            copyFiles(path.join(srcPath, child), path.join(destPath, child));
        });
    } else {
        fs.writeFileSync(destPath, fs.readFileSync(srcPath));
    }
}

// Public methods
module.exports = {
    configure: configure,
    setupCordova: setupCordova,
    buildProject: buildProject,
    packageProject: packageProject
}

