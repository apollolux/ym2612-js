# Preamble

This is a basic emulation of the Yamaha YM2612 synthesis chip written entirely in JavaScript. The intention is primarily to mockup interaction of a YM2612 core with an implementation of Steinberg's *VST* audio toolkit. This core is based entirely on the open-source C-based YM2612 core found in the Wii port of the Genesis Plus emulator.

* Genesis Plus can be found at [http://code.google.com/p/genplus-gx](http://code.google.com/p/genplus-gx)
* VST can be found at [http://www.steinberg.net/en/company/developer.html](http://www.steinberg.net/en/company/developer.html)
* Basic JavaScript implementation of VST by myself (as proof-of-concept for my mockup purposes) soon to follow!

# Installation

1. Download ym2612.js to a directory that's accessible by your intended webpage or other JavaScript-capable development environment (I personally use [Sphere](http://spheredev.org) for JavaScript).
2. Reference the file in your project.
	* In HTML, a normal script element on the page itself will do.
	* In Sphere, you'll need to RequireScript it.
3. Implementation instructions to follow!

# Usage

Usage instructions to follow!

# Disclaimer

[Genesis Plus](http://code.google.com/p/genplus-gx) is an open-source multi-platform emulator of the Sega Genesis/Mega Drive. I very much enjoy Genesis games and am a big fan of the audio output by the console, as well as FM synthesis in general, hence this project. The ultimate goal of this project is to create a usable YM2612 VST instrument for DAWs that support the VST format, as well as an Audio Unit for those OS X-based DAWs that support CoreAudio.
