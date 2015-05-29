# ******************
#  **Pre-requistes**
# ******************
#
# Set the following environment variables which will be used for caching Cordova components.
# 	CORDOVA_CACHE
# 	GRADLE_USER_HOME
#
# Then set the following to get the script to run:
# 	ANT_HOME
#	JAVA_HOME
#	ANDROID_HOME
#	%ANT_HOME%\bin, nodejs, Git command line tools, and npm need to be in PATH

$versions = "4.3.0", "5.0.0";
$platforms = "android", "windows", "wp8";
$plugins = "https://github.com/Chuxel/taco-cordova-support-plugin.git", "cordova-plugin-whitelist", "cordova-plugin-whitelist@1.0.0";
$plugnFetchCordovaVersion = "5.0.0";
$oneOffPlatforms = "android@3.7.0";
$platformFetchCordovaVersion = "5.0.0";

$pwd = $(get-location)
Write-Host "Current location: $pwd"

if((!$env:ANT_HOME) -or (!$env:JAVA_HOME) -or (!$env:ANDROID_HOME))	 {
	Write-Host "ERROR: ANT_HOME, JAVA_HOME, and ANDROID_HOME environment variables must be set."
	exit 1;
}
if(!$env:CORDOVA_CACHE) {
	$env:CORDOVA_CACHE=$env:APPDATA + "\cordova-cache"
	Write-Host "WARNING: CORDOVA_CACHE not set - Setting to $env:CORDOVA_CACHE."
}

if(!$env:GRADLE_USER_HOME) {
	Write-Host "WARNING: GRADLE_USER_HOME not set - Will be in a user specific location."
}

Write-Host "Cordova CLI versions to cache: $versions"
Write-Host "Cordova pinned platforms to cache: $platforms"
Write-Host "Cordova un-pinned platforms to cache: $oneOffPlatforms"
Write-Host "Cordova plugins cache: $plugins"
Write-Host "CORDOVA_CACHE: $env:CORDOVA_CACHE"
Write-Host "GRADLE_USER_HOME: $env:GRADLE_USER_HOME"

$origCH=$env:CORDOVA_HOME
Write-Host "Original CORDOVA_HOME: $origCH"
$env:CORDOVA_HOME=$env:CORDOVA_CACHE + "\_cordova";
Write-Host "Target CORDOVA_HOME: $env:CORDOVA_HOME"

$origPH=$env:PLUGMAN_HOME
Write-Host "Original PLUGMAN_HOME: $origPH"
$env:PLUGMAN_HOME=$env:CORDOVA_CACHE + "\_plugman";
Write-Host "Target PLUGMAN_HOME: $env:PLUGMAN_HOME"

if(Test-Path -Path $env:CORDOVA_CACHE) {
	Write-Host "WARNING: Cache folder already exists."
} else {
	mkdir $env:CORDOVA_CACHE
}

cd $env:CORDOVA_CACHE

# Use rmdir since this does not hit "path too long" errors common when deleting node_module folders by full path. (Old tech FTW)
if(Test-Path -Path "tempProj") {
	cmd /c "rmdir /S /Q tempProj"
}

foreach($version in $versions) {
	Write-Host "Prepping Cordova $version"
	if(!(Test-Path -Path $version)) {
		mkdir $version;
	}
	$fullpath = (gi $version).fullname
	Write-Host "Path to install cordova-lib / Cordova CLI: $fullpath"

	cd $version
	# Grabbing both cordova-lib and cordova so developers can use Cordova eitehr as a node module or a CLI
	npm install cordova-lib@$version
	npm install cordova@$version
	cd ..

	# Cache pinned platform version as approprate for this CLI version	
	cmd /c "$fullpath\node_modules\.bin\cordova" create tempProj
	cd tempProj
	foreach($platform in $platforms) {
		Write-Host "Caching pinned version of platform $platform"
		cmd /c "$fullpath\node_modules\.bin\cordova" platform add $platform
		if($platform -eq "android") {
				# We also need to build to ensure GRADLE_USER_HOME are prepped for Android
				Write-Host "Building to force depenedency acquistion for $platform"
				cmd /c "$fullpath\node_modules\.bin\cordova" build $platform		
		}
		cmd /c "$fullpath\node_modules\.bin\cordova" platform remove $platform
	}
	cd ..
	# Use rmdir since this does not hit "path too long" errors common when deleting node_module folders by full path. (Old tech FTW)
	cmd /c "rmdir /S /Q tempProj"
}

# Cache plugins
cmd /c "$env:CORDOVA_CACHE\$plugnFetchCordovaVersion\node_modules\.bin\cordova" create tempProj
cd tempProj
# Remove the whitelist plugin so it doesn't conflict if we're installing multiple versions of it to cache
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" platform add android
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" plugin remove cordova-plugin-whitelist --save
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" platform remove android
# Now cache plugins
foreach($plugin in $plugins) {
	Write-Host "Caching plugin $plugin"
	cmd /c "$env:CORDOVA_CACHE\$plugnFetchCordovaVersion\node_modules\.bin\cordova" plugin add $plugin
	cmd /c "$env:CORDOVA_CACHE\$plugnFetchCordovaVersion\node_modules\.bin\cordova" plugin remove $plugin
}
cd ..
cmd /c "rmdir /S /Q tempProj"

# Cache one-off (non-pinned) platforms
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" create tempProj
cd tempProj
# Remove the whitelist plugin since it doesn't work with older versions of platforms and is in the default template for 5.0.0+
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" platform add android
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" plugin remove cordova-plugin-whitelist --save
cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" platform remove android
# Now cache other platform versions
foreach($platform in $oneOffPlatforms) {
	Write-Host "Caching platform $platform"
	cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" platform add $platform
	cmd /c "$env:CORDOVA_CACHE\$platformFetchCordovaVersion\node_modules\.bin\cordova" platform remove $platform
}
cd ..
# Use rmdir since this does not hit "path too long" errors common when deleting node_module folders by full path. (Old tech FTW)
cmd /c "rmdir /S /Q tempProj"

$env:CORDOVA_HOME=$origCH
$env:PLUGMAN_HOME=$origPH
cd $pwd
