Cordova Continuous Integration (CI) / Team Build Helper Node Module (taco-team-build)
===============
License: MIT

taco-team-build is a node module designed to avoid common pitfalls when building any Cordova-CLI compliant (ex: Cordova Ionic, PhoneGap local) Cordova apps in a Continuous Integration (CI) environment. It was originally created for a set of tutorials for the [Tools for Apache Cordova](http://aka.ms/cordova) (TACo) feature set in Visual Studio but does **not** require its use. 

Specifically it helps with the following challenges:

1.  Handling multiple versions of Cordova from the same build server in a performant way on Windows
2.  Allowing developers to specify a location to store versions of Cordova, its plugins, and platforms outside of a user's home directory (useful in CI environments where a system user may run the build) 
3.  Generating an ipa for iOS when using versions of Cordova that do not automatically generate one
4.  Automated detection of whether a platform should be added avoid a non-zero exit code for incremental builds (the default CLI behavior)
5.  Removing plugins/android.json, plugins/ios.json, plugins/windows.json, or plugins/wp8.json files [which can cause strange results if present](http://go.microsoft.com/fwlink/?LinkID=691927) when adding a platform. (Though files are not removed if the Cordova platforms folder was added to source control.)
6.  Fixes for problems with symlinks and execute bits being lost when a plugin or platform is added to source control from Windows (via a plugin)
7.  Adds in support for the res/native folder that will overlay the contents of the platforms folder so you can add files to the native project without checking native code into source control (via a plugin) - Ex: res/native/Android/AndroidManifest.xml will overwrite the default one before Cordova's "prepare" step.
8.  Some Windows packaging features and bug fixes (via a plugin) designed for use with versions of Cordova that pre-date the Windows platform's support of build.json

It is a generic node module so it can be used with any number of build systems including Gulp, Grunt, and Jake.

General Settings
----------------
1. Set a **CORDOVA\_CACHE** environment variable to tell it where you want the various versions of Cordova to land.  You can also specify this using the module’s “configure” method. The TACO_HOME environment variable is also respected as a fallback. 2. The Cordova Version is automatically picked up from taco.json if present but can also be specified using the module's configure method
3. You can also set a **CORDOVA_DEFAULT_VERSION** environment variable if no version is specified at in either taco.json or the configure method. The final fallback is the latest version of Cordova.

Sample Usage
---------------------
### Gulp Build Sample
1.  Install Gulp globally if you haven’t (npm install -g gulp).
2.  Copy the contents of the “samples/gulp” folder to the root of your project.
3.  Go to the command line in that folder and type “npm install”
4.  Type "gulp"

### Grunt Build Sample
1.  Install Grunt globally if you haven’t (npm install -g grunt).
2.  Copy the contents of the “samples/grunt” folder to the root of your project.
3.  Go to the command line in that folder and type “npm install”
4.  Type "grunt"

### Command Line Utility Sample
1.  npm install the taco-team-build package globally (Ex: npm install -g c:\path\to\taco-team-build)
2.  Type "taco-team-build \[platform\] \[options\]"  (Ex: taco-team-build android --release --ant)
3.  Source can be found under "samples/cli"


Module Methods
-------
### configure(config)
Allows you to programmatically configure the Cordova version to use, the location that Cordova libraries should be cached, and the project path.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require('taco-team-build');
build.configure({
    nodePackageName: "cordova-cli",
    moduleCache: "D:\\path\\to\\cache",
    moduleVersion: "4.3.1",
    projectPath: "myproject"
}).done();
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-   **moduleCache** defaults to either the **CORDOVA\_CACHE** environment variable or %APPDATA%\taco_home on Windows and ~/.taco_home on OSX if no value is set for the variable. This will also automatically set CORDOVA\_HOME and PLUGMAN\_HOME to sub-folders in this same location to avoid conflicting with any global instllations you may have.
-   **projectPath** defaults to the current working directory.
-   If the **moduleVersion** is not set, the version will be pulled from **taco.json** if present and otherwise default to latest.  You can manually create a taco.json file if you are not using Visual Studio by including the following in the file:

    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    {
        "cordova-cli": "4.3.1"
    }
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

### setupCordova(config)
Downloads and installs the correct version of Cordova in the appropriate cache location.  See the configure method for defaults.  setupCordova() should always be called before executing a platform specific command. 

You can also pass in the same **config** object as the configure method to set configuration options before initialization.

The method returns a promise that is fulfilled with the appropriate cordova-lib node module once setup is completed.  Once setup has completed, you can use value from the promise to access a number of Cordova CLI functions in JavaScript. Ex:

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require("taco-team-build");
build.setupCordova().done(function(cordova) {
	cordova.plugin("add","org.apache.cordova.camera", function () {
		// Continue processing after camera plugin has been added
    });
});
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require("taco-team-build");
build.setupCordova().done(function(cordova) {
	cordova.run({platforms:["android"], options:["--nobuild"]}, function() {
		// Continue processing after run is complete
    });
});
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you would prefer to use a promise instead of a callback syntax, you can use "cordova.raw" to access that version of the function.

### buildProject(platforms, args)
Builds the specified platform(s). Passed in **platforms** can be an array of platforms or a single platform string. Unlike cordova.raw.build, passed in **args** can be an array of arguments or an object with an array of arguments per platform name. The method returns a promise that is fulfilled once the specified platform(s) are built.

The method automatically calls setupCordova() if it has not yet been called.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require('taco-team-build'),
    platforms = ["android", "windows"],
    args = { android: ["--release", "--ant"], windows: ["--release"] };
            
build.buildProject(platforms, args).done();
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

**WARNING**: Unlike the Cordova CLI, you should not use the "double-double dash" when referencing platform specific arguments. Ex: Use "--ant" not "-- --ant" for Android.

Not only will your flag not be picked up but older versions of the Cordova Android platform will error out if you specify unrecognized flags with a "TypeError: Cannot call method 'prepEnv' of undefined" error.  (This particular error is fixed Cordova 4.3.0 but your flags will still be ignored.)

### packageProject(platforms, args)
Supported platforms: ios

Runs any post-build packaging steps required for the specified platforms. The method returns a promise that is fulfilled once packaging is completed. Passed in **platforms** can be an array of platforms or a single platform string. Passed in **args** can be an array of arguments or an object with an array of arguments per platform name.

**Note:** The android, windows, and wp8 platforms automatically package on build and you can place the appropriate files for signing under res/native/android or res/native/windows. See [this tutorial](http://go.microsoft.com/fwlink/?LinkID=613702) for details.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require('taco-team-build');

build.buildProject("ios",["--device"])); })
    .then(function() { return build.packageProject("ios"); })
    .done();
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

iOS Arguments:
- **--sign**: Specifies an alternate signing identity or a path to a signing file
- **--embed**: Specifies the location of an alternate provisioning profile

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
build.packageProject("ios", ["--sign=/path/to/signing.p12" ", "--embed=/path/to/some.mobileprovision"]); 
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

You can also add a custom **[build-debug.xcconfig](https://github.com/apache/cordova-ios/blob/master/bin/templates/scripts/cordova/build-debug.xcconfig)** or **[build-release.xcconfig](https://github.com/apache/cordova-ios/blob/master/bin/templates/scripts/cordova/build-release.xcconfig)** file in the **res/native/ios/cordova** folder in your project to set these and other iOS [build settings](https://developer.apple.com/library/ios/documentation/DeveloperTools/Reference/XcodeBuildSettingRef/0-Introduction/introduction.html#//apple_ref/doc/uid/TP40003931-CH1-SW1). Be sure to grab the version of these files from the branch appropriate for the version of Cordova you are targeting - the "master" branch may not be compatible with your version.

For iOS you may need to unlock the keychain to build your app depending on your build server. You can use some variant of the following shell command to do so: 
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
security unlock-keychain -p ${KEYCHAIN_PWD} ${HOME}/Library/Keychains/login.keychain 
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

### getInstalledPlatformVersion(projectPath, platform)
Returns the version of the platform that is installed to the project.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require('taco-team-build'),
    platform = "android";

build.getInstalledPlatformVersion("./",platform))
    .then(function(version) { return version; })
    .done();
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

### getVersionForNpmPackage(pkgName)
Returns the latest version of pkgName available on NPM.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require('taco-team-build');

build.getVersionForNpmPackage("taco-team-build"))
    .then(function(version) { return version; })
    .done();
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

### getNpmVersionFromConfig(config)
Returns the version of NPM specified in the config.

### cacheModule(config)
Caches the NPM module specified by the config.
Config specifies both the name of the package and the expected version. Empty version assumes latest.

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
var build = require('taco-team-build'),
    config = {
        nodePackageName: "cordova-cli",
        moduleCache: "D:\\path\\to\\cache",
        moduleVersion: "4.3.1",
        projectPath: "myproject"
    };

build.cacheModule(config)
    .then(function(version) { return version; })
    .done();
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-   **projectPath** is assumed to be the current working directory if not specified.
-   **moduleVersion** is assumed to be latest if not specified.
-   **moduleCache** defaults to either the **CORDOVA\_CACHE** environment variable or %APPDATA%\taco_home on Windows and ~/.taco_home on OSX if no value is set for the variable. This will also automatically set CORDOVA\_HOME and PLUGMAN\_HOME to sub-folders in this same location to avoid conflicting with any global instllations you may have.

## Terms of Use
By downloading and running this project, you agree to the license terms of the third party application software, Microsoft products, and components to be installed. 

The third party software and products are provided to you by third parties. You are responsible for reading and accepting the relevant license terms for all software that will be installed. Microsoft grants you no rights to third party software.


## License
Unless otherwise mentioned, the code samples are released under the MIT license.

```
The MIT License (MIT)

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
