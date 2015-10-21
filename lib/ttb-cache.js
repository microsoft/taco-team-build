/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
// Module dependencies
var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    tu = require("./ttb-util.js"),
    exec = Q.nfbind(require('child_process').exec);

// Constants
var SUPPORT_PLUGIN_PATH = path.resolve(__dirname,"..","cordova-plugin-vs-taco-support"),
    SUPPORT_PLUGIN_ID = "cordova-plugin-vs-taco-support",
    DEFAULT_CORDOVA_VERSION = "5.3.3",
    // cordova-lib is technically what we want to given that is what cordova gives us when you "requre"
    // the node the "cordova" node module. However, the "cordova" and "cordova-lib" package version 
    // numbers do not match in CLI < v3.7.0. Ex: 3.6.3-0.2.13 does not match cordova-lib's version. 
    CORDOVA = "cordova";


// Global vars
var defaultCordovaVersion = process.env["CORDOVA_DEFAULT_VERSION"] || DEFAULT_CORDOVA_VERSION,
    loadedModulePath,
    cdv;

(function init() {
    var cc = process.env["CORDOVA_CACHE"];
    // If no CORDOVA_CACHE, check TACO_HOME, and otherwise default to taco's default location
    if(!cc) {
        var th = process.env["TACO_HOME"];
        if(th) {
            cc = path.resolve(th,"node_modules","cordova");
        } else {
            if(process.platform === "darwin" || process.platform === "linux") {
                cc = path.resolve(process.env["HOME"],".taco_home","node_modules","cordova");
            } else {
                cc = path.resolve(process.env["APPDATA"], "taco_home","node_modules","cordova");
            }
        }
    } else {
        cc = path.resolve(cc);
    }
    tu.setCachePath(cc);    
})();

// Install module method
function cacheModule(cfg) {
    cfg = tu.parseConfig(cfg);
    var cordovaCache = tu.getCachePath();
    console.log("Module cache at " + cordovaCache);

    var version;    
    // If no version is set, try to get the version from taco.json
    if (cfg.cordovaVersion === undefined && cfg.cordovaPackageName == CORDOVA) {
        if (fs.existsSync(path.join(cfg.projectPath, "taco.json"))) {
            version = require(path.join(cfg.projectPath, "taco.json"))["cordova-cli"];
            console.log("Cordova version set to " + version + " based on the contents of taco.json");
        } else {
            version = defaultCordovaVersion;
            console.log("taco.json not found. Using default Cordova version of " + version);
        }
    } else {
        version = cfg.cordovaVersion;
    }

    // Install correct cordova version if not available
    var versionPath = path.join(cordovaCache, version ? version : "global");
    var targetModulePath = path.join(versionPath, "node_modules", cfg.cordovaPackageName)
    var pkgStr = cfg.cordovaPackageName + (version ? "@" + version : "");
    if (!fs.existsSync(targetModulePath)) {  // Fix: Check module is there not just root path
        if(!fs.existsSync(versionPath)) {
            fs.mkdirSync(versionPath);
            fs.mkdirSync(path.join(versionPath, "node_modules")); // node_modules being present ensures correct install loc
        }
        console.log("Installing " + pkgStr + ". (This may take a few minutes.)");
        var cmd = "npm install " + pkgStr
        return exec(cmd, { cwd: versionPath })
            .then(tu.handleExecReturn)
            .then(function() {
                return {
                    version: version,
                    path: targetModulePath
                }
            });
    } else {
        console.log(pkgStr + " already installed.");
        return Q({
            version: version,
            path: targetModulePath
        });
    }
    
}

// Utility method that "requires" the correct version of cordova-lib, adds in the support plugin if not present, sets CORDOVA_HOME 
function loadModule(modulePath, /* optional */ projectPath, /* optional */ addSupportPlugin) {
    if(!addSupportPlugin) addSupportPlugin = true;
    // Setup environment
    if (cdv === undefined || loadedModulePath != modulePath) {
        cdv = require(modulePath);
        if(cdv.cordova) {
            cdv = cdv.cordova;
        }
        loadedModulePath = modulePath;
        // Install VS support plugin if not already present
        if(projectPath && addSupportPlugin && !fs.existsSync(path.join(projectPath, "plugins", SUPPORT_PLUGIN_ID))) {
            process.chdir(projectPath);
            console.log("Adding support plugin.");
            return cdv.raw.plugin("add", SUPPORT_PLUGIN_PATH).then(function() { return cdv; });
        } else {
            return Q(cdv);
        }
    } else {    
        return Q(cdv);
    }
}

function getModulePath(version, /* optional */ moduleName) {
    if(!moduleName) moduleName = CORDOVA;
    return path.join(tu.getCachePath(), version, "node_modules", moduleName);
}

function getLoadedModule(/* optional */ version, /* optional */ moduleName)
{
    if(!version) return cdv;
    
    if(loadedModulePath == getModulePath(version, moduleName)) {
        return cdv;
    } else {
        return undefined;
    }
}

// Public methods
module.exports = {
    cacheModule: cacheModule,           // Installs / caches module and returns path
    loadModule: loadModule,             // Loads and returns module
    getLoadedModule: getLoadedModule,   // Only returns module if loaded
    getModulePath: getModulePath,       // Gets expected path to module
    getCachePath: function() { return tu.getCachePath(); },
    setCachePath: function(newPath) { return tu.setCachePath(newPath); },
    CORDOVA: CORDOVA,
    SUPPORT_PLUGIN_ID: SUPPORT_PLUGIN_ID,
    SUPPORT_PLUGIN_PATH: SUPPORT_PLUGIN_PATH
};
