/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
// Module dependencies
var fs = require('fs');
var path = require('path');
var Q = require('q');
var tu = require('./ttb-util.js');
var exec = Q.nfbind(require('child_process').exec);

// Constants
// cordova-lib is technically what we want to given that is what cordova gives us when you 'requre'
// the node the 'cordova' node module. However, the 'cordova' and 'cordova-lib' package version 
// numbers do not match in CLI < v3.7.0. Ex: 3.6.3-0.2.13 does not match cordova-lib's version. 
var CORDOVA = 'cordova';

// Global vars
var loadedModulePath;
var loadedModule;

(function init() {
    var cc = process.env['CORDOVA_CACHE'];
    // If no CORDOVA_CACHE, check TACO_HOME, and otherwise default to taco's default location
    if (!cc) {
        var th = process.env['TACO_HOME'];
        if (th) {
            cc = path.resolve(th, 'node_modules');
        } else {
            if (process.platform === 'darwin' || process.platform === 'linux') {
                cc = path.resolve(process.env['HOME'], '.taco_home', 'node_modules');
            } else {
                cc = path.resolve(process.env['APPDATA'], 'taco_home', 'node_modules');
            }
        }
    } else {
        cc = path.resolve(cc);
    }
    tu.setCachePath(cc);
})();

// Extracts the module version from a configuration
function getModuleVersionFromConfig(cfg) {
    if (cfg.moduleVersion === undefined && cfg.nodePackageName == CORDOVA) {
        // If no version is set, try to get the version from taco.json
        // This check is specific to the Cordova module
        if (tu.fileExistsSync(path.join(cfg.projectPath, 'taco.json'))) {
            var version = require(path.join(cfg.projectPath, 'taco.json'))['cordova-cli'];
            
            if (version) {
                console.log('Cordova version set to ' + version + ' based on the contents of taco.json');
                return version;
            }
        }
    }
    
    return cfg.moduleVersion || process.env[makeDefaultEnvironmentVariable(cfg.nodePackageName)];
}

function makeDefaultEnvironmentVariable(packageName) {
    if (typeof packageName !== 'string') {
        return undefined;
    }
    
    return packageName.toUpperCase() + '_DEFAULT_VERSION';
}

// Install module method
function cacheModule(cfg) {
    cfg = tu.parseConfig(cfg);
    var moduleCache = tu.getCachePath();
    console.log('Module cache at ' + moduleCache);

    var version = getModuleVersionFromConfig(cfg);

    var pkgStr = cfg.nodePackageName + (version ? '@' + version : '');
    return tu.getVersionForNpmPackage(pkgStr).then(function (versionString) {
        // Install correct cordova version if not available
        var versionPath = path.join(moduleCache, version ? version : versionString);
        var targetModulePath = path.join(versionPath, 'node_modules', cfg.nodePackageName)
        if (!tu.fileExistsSync(targetModulePath)) {  // Fix: Check module is there not just root path
            if (!tu.fileExistsSync(versionPath)) {
                fs.mkdirSync(versionPath);
                fs.mkdirSync(path.join(versionPath, 'node_modules')); // node_modules being present ensures correct install loc
            }

            console.log('Installing ' + pkgStr + '. (This may take a few minutes.)');
            var cmd = 'npm install ' + pkgStr;
            return exec(cmd, { cwd: versionPath })
                .then(tu.handleExecReturn)
                .then(function () {
                return {
                    version: version,
                    path: targetModulePath
                };
            });
        } else {
            console.log(pkgStr + ' already installed.');
            return Q({
                version: version,
                path: targetModulePath
            });
        }
    });
}

// Utility method that loads a previously cached module and returns a promise that resolves to that object
function loadModule(modulePath) {
    // Setup environment
    if (loadedModule === undefined || loadedModulePath != modulePath) {
        loadedModule = require(modulePath);
        loadedModulePath = modulePath;
        
        return Q(loadedModule);        
    } else {
        return Q(loadedModule);
    }
}

function getModulePath(config) {
    if (typeof config.moduleVersion !== 'string') {
        return undefined;
    }
    
    var moduleName = config.nodePackageName || CORDOVA;
    return path.join(tu.getCachePath(), config.moduleVersion, 'node_modules', moduleName);
}

function getLoadedModule(/* optional */ config) {
    if (!config) return loadedModule;

    if (loadedModulePath !== undefined && loadedModulePath == getModulePath(config)) {
        return loadedModule;
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
    getCachePath: tu.getCachePath,
    setCachePath: tu.setCachePath,
    getModuleVersionFromConfig: getModuleVersionFromConfig,
    CORDOVA: CORDOVA
};