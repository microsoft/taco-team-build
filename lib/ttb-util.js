/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
// Module dependencies
var fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    exec = Q.nfbind(require('child_process').exec);

var moduleCache;

// Utility method to handle the return of exec calls - namely to send output to stdout / stderr
function handleExecReturn(result) {
    console.log('Exec complete.');
    console.log(result[0]);
    if (result[1] && result[1] !== '') {
        console.error(result[1]);
    }
    return result;
}

function joinAndCreatePath(pathList) {
    var outPath;
    pathList.forEach(function (relPath) {
        if (relPath === '') relPath = path.sep;
        if (!outPath) {
            outPath = relPath;
        } else {
            outPath = path.resolve(outPath, relPath);
        }
        if (!fs.existsSync(outPath)) fs.mkdirSync(outPath);
    });
    return outPath;
}

// Utility method that coverts args into a consistant input understood by cordova-lib
function getCallArgs(platforms, args) {
    // Processes single platform string (or array of length 1) and an array of args or an object of args per platform
    args = args || [];
    if (typeof (platforms) == 'string') {
        platforms = [platforms];
    }
    // If only one platform is specified, check if the args is an object and use the args for this platform if so
    if (platforms.length == 1) {
        if (args instanceof Array) {
            return { platforms: platforms, options: args };
        } else {
            return { platforms: platforms, options: args[platforms[0]] };
        }
    }
}


// Returns a promise that contains the installed platform version (vs the CLI version). Works in both new and old versions of the Cordova. (No cordova-lib API exists.)
function getInstalledPlatformVersion(projectPath, platform) {
    var platformJsonPath = path.join(projectPath, 'platforms', 'platforms.json')
    if (fs.existsSync(platformJsonPath)) {
        var platformsJson = require(path.join(projectPath, 'platforms', 'platforms.json'));
        return Q(platformsJson[platform]);
    } else {
        return exec(path.join(projectPath, 'platforms', platform, 'cordova', 'version')).then(function (result) {
            return result[0].replace(/\r?\n|\r/g, '');
        });
    }
}

// Returns a promise that contains the latest version of an npm package
function getVersionForNpmPackage(pkgName) {
    return exec('npm view ' + pkgName + ' version').then(function (result) {
        return result[0].replace(/\r?\n|\r/g, '');
    });
}

function parseConfig(newCfg, currentCfg) {
    if (!currentCfg) currentCfg = {};
    if (!newCfg) return (currentCfg);
    
    // Path to module cache
    if (newCfg.moduleCache) {
        setCachePath(joinAndCreatePath(path.resolve(newCfg.moduleCache)));
    }
    
    // Version of node module to use
    if (newCfg.moduleVersion) currentCfg.moduleVersion = newCfg.moduleVersion;

    // Inidcates whether the cordova node module should be loaded after its cached - must be false to use buldProject
    if (newCfg.loadCordovaModule) currentCfg.loadCordovaModule = newCfg.loadCordovaModule;
    
    // Inidcates whether support plugin should be installed
    if (newCfg.addSupportPlugin) currentCfg.addSupportPlugin = newCfg.addSupportPlugin;

    // Allows use of other Cordova CLI style modules when caching only
    if (newCfg.nodePackageName) currentCfg.nodePackageName = newCfg.nodePackageName;

    // Project path if not cwd
    if (newCfg.projectPath) {
        currentCfg.projectPath = path.resolve(newCfg.projectPath);
        if (!fs.existsSync(currentCfg.projectPath)) {
            throw 'Specified project path does not exist: "' + currentCfg.projectPath + '"';
        }
    }
    return currentCfg;
}

function setCachePath(newPath) {
    moduleCache = joinAndCreatePath(newPath.split(path.sep));
    process.env['CORDOVA_HOME'] = path.join(moduleCache, '_cordova'); // Set platforms to cache in cache location to avoid unexpected results
    process.env['PLUGMAN_HOME'] = path.join(moduleCache, '_plugman'); // Set plugin cache in cache location to avoid unexpected results
}

function getCachePath() {
    return moduleCache;
}

module.exports = {
    handleExecReturn: handleExecReturn,
    joinAndCreatePath: joinAndCreatePath,
    getCallArgs: getCallArgs,
    getInstalledPlatformVersion: getInstalledPlatformVersion,
    getVersionForNpmPackage: getVersionForNpmPackage,
    parseConfig: parseConfig,
    getCachePath: getCachePath,
    setCachePath: setCachePath
}