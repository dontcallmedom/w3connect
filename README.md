W3Connect is a mobile-optimized Web app that can be used as a companion to multi-track conferences.

It allows conference participants to register their Twitter account, check in in the various rooms of the conference, orient themselves with maps, and see who else is participating.

The app has been developed and used mostly for the W3C Technical Plenary week (see its archived version for [TPAC 2012](http://www.w3.org/2012/10/TPAC/live/)), but most of it can be adapted for other conferences (it was used once at Over The Air 2011).

How to run
==========
The web app works on top of node, and should be lauched with "node node.js/app.js", after having installed the proper packages with "npm install" (in node.js).

It takes input from a configuration file (config.ini) that defines how and where the application will be made available, as well as a number of additional parameters. A config-sample.ini can be used as a template for that configuration file.
