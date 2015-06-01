@ECHO OFF

REM  Copyright (c) Microsoft. All rights reserved.  
REM  Licensed under the MIT license. See LICENSE file in the project root for full license information.

IF NOT DEFINED CORDOVA_CACHE set CORDOVA_CACHE=%APPDATA%\cordova-cache
IF NOT DEFINED CORDOVA_VERSION (
	ECHO CORDOVA_VERSION not defined. Cached versions:
	DIR %CORDOVA_CACHE% /b
) ELSE (
	CALL %CORDOVA_CACHE%\%CORDOVA_VERSION%\node_modules\.bin\cordova.cmd %*
)