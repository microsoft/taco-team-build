/// <binding BeforeBuild='sass' />
"use strict";

/*
  Copyright (c) Microsoft. All rights reserved.  
  Licensed under the MIT license. See LICENSE file in the project root for full license information.
*/
var gulp = require("gulp"),
    fs = require("fs"),
    ts = require("gulp-typescript"),
    sass = require("gulp-sass"),
    es = require('event-stream'),
    cordovaBuild = require("taco-team-build");

// Setup platforms to build that are supported on current hardware
var winPlatforms = ["android", "windows"],
    linuxPlatforms = ["android"],
    osxPlatforms = ["ios"],
    platformsToBuild = process.platform === "darwin" ? osxPlatforms :                   
                       (process.platform === "linux" ? linuxPlatforms : winPlatforms),   

    // Build config to use for build - Use Pascal case to match paths set by VS
    buildConfig = "Release",

    // Arguments for build by platform. Warning: Omit the extra "--" when referencing platform
    // specific options (Ex:"-- --gradleArg" is "--gradleArg").
    buildArgs = {
        android: ["--" + buildConfig.toLocaleLowerCase(),"--device","--gradleArg=--no-daemon"],                
        ios: ["--" + buildConfig.toLocaleLowerCase(), "--device"],                                             
        windows: ["--" + buildConfig.toLocaleLowerCase(), "--device"]                                          
    },                                                                              

    // Paths used by build
    paths = {
       tsconfig: "scripts/tsconfig.json",
       ts: "./scripts/**/*.ts",
       sass: "./scss/**/*.scss",
       sassCssTarget: "./www/css/",
       apk:["./platforms/android/ant-build/*.apk", 
            "./platforms/android/bin/*.apk", 
            "./platforms/android/build/outputs/apk/*.apk"],
       binApk: "./bin/Android/" + buildConfig,
       ipa: ["./platforms/ios/build/device/*.ipa",
             "./platforms/ios/build/device/*.app.dSYM"],
       binIpa: "./bin/iOS/" + buildConfig,
       appx: "./platforms/windows/AppPackages/**/*",
       binAppx: "./bin/Windows/" + buildConfig
    };                                                  

// Set the default to the build task
gulp.task("default", ["build"]);

// Executes taks specified in winPlatforms, linuxPlatforms, or osxPlatforms based on
// the hardware Gulp is running on which are then placed in platformsToBuild
gulp.task("build",  ["scripts", "sass"], function() {
    return cordovaBuild.buildProject(platformsToBuild, buildArgs)
        .then(function() {    
            // ** NOTE: Package not required in recent versions of Cordova
            return cordovaBuild.packageProject(platformsToBuild)
                .then(function() {             
                    return es.concat(
                            gulp.src(paths.apk).pipe(gulp.dest(paths.binApk)),
                            gulp.src(paths.ipa).pipe(gulp.dest(paths.binIpa)),
                            gulp.src(paths.appx).pipe(gulp.dest(paths.binAppx)));            
                });
        });
});

// Build Android, copy the results back to bin folder
gulp.task("build-android", ["scripts", "sass"], function() {
    return cordovaBuild.buildProject("android", buildArgs)
        .then(function() {
            return gulp.src(paths.apk).pipe(gulp.dest(paths.binApk));
        });
});

// Build iOS, copy the results back to bin folder
gulp.task("build-ios", ["scripts", "sass"], function() {
    return cordovaBuild.buildProject("ios", buildArgs)
        .then(function() {    
            // ** NOTE: Package not required in recent versions of Cordova
            return cordovaBuild.packageProject(platformsToBuild)
                .then(function() {             
                    return gulp.src(paths.ipa).pipe(gulp.dest(paths.ipaBin));
                });
        });
});

// Build Windows, copy the results back to bin folder
gulp.task("build-win", ["scripts", "sass"], function() {
    return cordovaBuild.buildProject("windows", buildArgs)
        .then(function() {
            return gulp.src(paths.appx).pipe(gulp.dest(paths.appxBin));            
        });
});

// Typescript compile - Can add other things like minification here
gulp.task("scripts", function () {
    // Compile TypeScript code - This sample is designed to compile anything under the "scripts" folder using settings
    // in tsconfig.json if present or this gulpfile if not.  Adjust as appropriate for your use case.
    if (fs.existsSync(paths.tsconfig)) {
        // Use settings from scripts/tsconfig.json
        gulp.src(paths.ts)
            .pipe(ts(ts.createProject(paths.tsconfig)))
            .pipe(gulp.dest("."));
    } else {
        // Otherwise use these default settings
         gulp.src(paths.ts)
            .pipe(ts({
                noImplicitAny: false,
                noEmitOnError: true,
                removeComments: false,
                sourceMap: true,
                out: "appBundle.js",
            target: "es5"
            }))
            .pipe(gulp.dest("www/scripts"));        
    }
});

// SASS compile (ex in Ionic)
gulp.task("sass", function () {
  return gulp.src(paths.sass)
    .pipe(sass().on("error", sass.logError))
    .pipe(gulp.dest(paths.sassCssTarget));
});
