/*!
 * Nokia Mobile Web Templates v2.0
 * http://forumnokia.com
 *
 * Copyright (c) 2011 Forum Nokia
 *
 */

/*
 * doHighlight(element:which)
 * usage: onMouseDown="JavaScript:doHighlight(this);"
 * Optional function that can be used to add the hover state on press.
 * Applies class 'hovering' on mousedown.
 * Timeout is set to expire after 500 milliseconds at which time the 'hovering' state is removed.
 * Also called within the slide show.
 *
 */
function doHighlight(which) {
	if(which.timeout) {
		clearTimeout(which.timeout);
		which.timeout = 0;
	}
	
	which.className += " "+"hovering";

	var that = which;
	which.timeout = setTimeout(function() {					
		var reg = new RegExp('(\\s|^)'+ "hovering" +'(\\s|$)');
		that.className = that.className.replace(reg,' ');
		},500); 
}

/*
 * Preloader to load key user interface images that are specificed within the CSS
 */
	var ImagePreloader = {
		list: [],
		images: [],
		add: function( images ) {
			this.list = this.list.concat( images );
		},
		start: function() {
			for (var i = 0; i < this.list.length; i++) {
				var img = new Image();
				img.src = this.list[i];
				this.images.push(img);
			}
		}
	}
	
	ImagePreloader.add( [
		"/2012/10/TPAC/live/img/global-hover.png",
		"/2012/10/TPAC/live/img/sprite-expand-collapse.png",
		"/2012/10/TPAC/live/img/toggle-button.png",
		"/2012/10/TPAC/live/img/toggle-on.png",
		"/2012/10/TPAC/live/img/toggle-off.png",
		"/2012/10/TPAC/live/img/button.png"
				
		] );
	
	ImagePreloader.start();
/*
 * Slideshow(string:id, int:index, boolean:wrap)
 * usage: mySlideshow = new Slideshow("coming-soon", 0, true);
 *
 */

function Slideshow(_id, _totalslides, _wrap) {
	var totalslides, index, wrap, prefix, suffix, image, src, context, progress;
	var slideshow = document.getElementById(_id);
	var _images = slideshow.getElementsByTagName("img");
	image = _images[0];
	var _ps = slideshow.getElementsByTagName("p");
	progress = _ps[0];
	context = this;
	
	src = image.getAttribute("src");
	// parse the url
	// assumes image_001.jpg <- note three digits
	var _a = src.indexOf("_");
	var _b = src.indexOf(".");
	prefix = src.substring(0,_a+1);
	suffix = src.substring(_b,src.length);
	index = parseInt(src.substring(_a+1, _b));
	totalslides = _totalslides;
	
	// does the slideshow wrap around at the beginning and end?
	(_wrap)? wrap = _wrap : wrap = false;
	
	// if the slideshow id isn't found do nothing (false)...
	(slideshow)?init():false;
	
	function init() {

		// find and enable the previous and next controls, and current slide display
		// calls doHighlight() function to apply and remove hover state
		var _ul = slideshow.getElementsByTagName("ul");
		for (var i=0; i < _ul.length; i++) {
			var _li = _ul[0].getElementsByTagName("li");
			for (var j=0; j < _li.length; j++) {
				var isPrevious = _li[j].className.search(/previous/)+1;
				if (isPrevious) {
					var _a = _li[j].getElementsByTagName("a");
					_a[0].onmousedown = function() {
						doHighlight(this.parentNode);
					}
					_a[0].onclick = function() {
						context.previous();
						return false;
					}
				}
				var isNext = _li[j].className.search(/next/)+1;
				if (isNext) {
					var _a = _li[j].getElementsByTagName("a");
					_a[0].onmousedown = function() {
						doHighlight(this.parentNode);
					}
					_a[0].onclick = function() {
						context.next();
						return false;
					}
				}
			}
		}
		// kick things off with an initial update
		update();
	}

	function update() {
		// tweak index if at start or end based on wrap property
		(index<1)?((wrap)?index=totalslides:index=1):false;
		(index>totalslides)?((wrap)?index=1:index=totalslides):false;
		// update the view
		image.setAttribute("src", prefix+(("00" + index).slice (-3))+suffix);
		progress.innerHTML = index + "/" + totalslides;
	}
	this.previous = function () {
		// select the previous image by index and update the view
	    index--;update();
	}
	
	this.next = function () {
		// select the next image by index and update the view
		index++;update();
	}
}

/*
 * AccordionList(string:id, callback:function)
 * usage: myAccordianList = new AccordianList(id, callback);
 * - id 'foo' can also be an array such as ids['foo','bar']
 * - callback (optional) function is triggered when a <dt> within the list is clicked
 *   and passes a reference to itself to the defined callback function.
 */
 
function AccordionList(_id, _callback) {
	var id = new Array();
	var callback;
	(!_isArray(_id))?id.push(_id):id=_id;
	(typeof _callback=="function")?callback=_callback:callback=function(){};

    function removeClass(element, classes) {
	var className = element.getAttribute("class") || "";
	for (c in classes) {
	    className = className.replace(classes[c], "");
	}
	element.setAttribute("class", className);
    }
	
	for (var x=0;x<id.length;x++) {
		var dl = document.getElementById(id[x]);
		var dt = dl.getElementsByTagName("dt");
		for (var j=0; j < dt.length; j++) {
			var state = dt[j].getAttribute("class");
			// no classes defined, add class attribute with value 'collapsed'
			if (state != null) {
			    //dt[j].setAttribute("class", "collapsed");
			    //state = "";//dt[j].getAttribute("class");
			    //}
			var expanded = state.search(/expanded/)+1;
			
			// find corresponding dd element
			var dd = dt[j];
			    var counter = 0;
		    do { do dd = dd.nextSibling;
			 while (dd && dd.nodeType != 1);
			 if (dd && dd.tagName == 'DD') {
			     counter ++;
			     var className = dd.getAttribute("class") || "";
			     (expanded)? removeClass(dd, ["teaser", "hidden"]) : (counter == 1 ? dd.setAttribute("class",  className+ " teaser") : dd.setAttribute("class", className+ " hidden")) ;
			     if (counter == 1)  {
				 dd.appendChild(document.createElement("span"));
			     }
			 }
		       } while (dd && dd.nodeType == 1 && dd.tagName=='DD');
			
			dt[j].onclick = function() {
				var dd = this;
				var state = this.getAttribute("class");
				var expanded = state.search(/expanded/)+1;
				var toggle;
				(expanded) ? toggle = state.replace(/expanded/, "collapsed") : toggle = state.replace(/collapsed/, "expanded") ;
				this.setAttribute("class", toggle);
			    var counter = 0;
			    do { do dd = dd.nextSibling;
			    while (dd && dd.nodeType != 1);
				 if (dd && dd.tagName == 'DD') {
				     counter++;
				     var className= dd.getAttribute("class") || "";
				     (className.indexOf("teaser") != -1 || className.indexOf("hidden") != -1)? removeClass(dd, ["teaser", "hidden"]) : (counter == 1 ? dd.setAttribute("class", className+ " teaser") : dd.setAttribute("class", className+ " hidden"));
				 }
			       } while (dd && dd.nodeType == 1 && dd.tagName=='DD');
				callback(this);
			}}
		}	
	}
}

/*
 * toggleSwitch()
 * usage: mySwitch = new toggleSwitch(id, function);
 * id can also be an array such as ids['foo','bar'…]
 * 
 */
 
function ToggleSwitch(_id, _callback) {
	var id = new Array();
	var callback;
	(!_isArray(_id))?id.push(_id):id=_id;
	(typeof _callback=="function")?callback=_callback:callback=function(){};
	
	for (var x=0;x<id.length;x++) {
		var toggle = document.getElementById(id[x]);
		toggle.style['display'] = "none";	
		// now let's build the toggle switch dynamically...	
		var ol = document.createElement("ol");
		// set the class based on the state of the toggle (checkbox)
		var toggleClass = "toggle-switch ";
		(toggle.checked)?toggleClass += "on":toggleClass += "off";
		ol.setAttribute("class", toggleClass);
		// create the <li class="label-on"> element
		var lion = document.createElement("li");
		lion.setAttribute("class", "label-on");
		// create the <li class="label-off"> element
		var lioff = document.createElement("li");
		lioff.setAttribute("class", "label-off");
		// create the 'on' <a> element
		var aon = document.createElement("a");
		aon.setAttribute("href", "#on");
		aon.appendChild(document.createTextNode("on"));
		// create the 'off' <a> element
		var aoff = document.createElement("a");
		aoff.setAttribute("href", "#off");
		aoff.appendChild(document.createTextNode("off"));
		// assemble all of the various elements
		lioff.appendChild(aoff);
		lion.appendChild(aon);
		ol.appendChild(lion);
		ol.appendChild(lioff);
		// clone and add the original (and hidden) checkbox to the toggle swithc
		ol.appendChild(toggle.cloneNode(true));
		// add the click event
		ol.onclick = function() {
			var state = this.getAttribute("class");
			var on = state.search(/on/)+1;
			var toggle;
			var checkbox = this.getElementsByTagName("input");
			if (on) {
				toggle = state.replace(/on/, "off");
				checkbox[0].removeAttribute("checked");
			} else {
				toggle = state.replace(/off/, "on");
				checkbox[0].setAttribute("checked", "true");
			}
			this.setAttribute("class", toggle);
			callback(this);
		}
		// replace the original 'toggle' element with the new one
		toggle.parentNode.replaceChild(ol, toggle);		
	}
}

/*
 * styleTweaker()
 * usage: myStyleTweaker = new styleTweaker();
 * id can also be an array such as ids['foo','bar'…]
 * 
 */
 
function StyleTweaker() {
	this.ua = navigator.userAgent;
	this.tweaks = new Object();
}

StyleTweaker.prototype.add = function(_string, _stylesheet) {
	this.tweaks[_string] = _stylesheet;
}

StyleTweaker.prototype.remove = function(_term) {
	for (var _string in this.tweaks) {
		var exists = false;
		(_string == _term)?exists=true:false;
		(this.tweaks[_string])?exists=true:false;
		(exists)?delete this.tweaks[_string]:false;
	}
}

StyleTweaker.prototype.tweak = function() {
	for (var _string in this.tweaks) {
		if (this.ua.match(_string)) {
			loadStylesheet(this.tweaks[_string]);
		}
	}
}

StyleTweaker.prototype.untweak = function() {
	for (var _string in this.tweaks) {
		if (this.ua.match(_string)) {
			removeStylesheet(this.tweaks[_string]);
		}
	}
}

/*
 * _isArray()
 * usage: _isArray(object);
 * 
 */
function _isArray(x){
	return ((typeof x == "object") && (x.constructor == Array));
}

/*
 * addEvent()
 * usage: addEvent(event, function);
 * note: only targets window events!
 * 
 */

function addEvent(_event, _function) {
	var _current_event = window[_event];
	if (typeof window[_event] != 'function') {
		window[_event] = _function;
	} else {
		window[_event] = function() {
			_current_event();
			_function();
		}
	}
}

/*
 * include(file)
 * usage: include(filename.js);
 * 
 */

function include(filename) {
	var head = document.getElementsByTagName("head")[0];
	var script = document.createElement("script");
	script.setAttribute("type", "text/javascript");
	script.setAttribute("src", filename);
	head.appendChild(script);
}

/*
 * loadStylesheet(file)
 * usage: loadStylesheet(filename.css);
 * 
 */
 
function loadStylesheet(filename) {
	var head = document.getElementsByTagName('head')[0];
	var link = document.createElement("link");
	link.setAttribute("rel", "stylesheet");
	link.setAttribute("type", "text/css");
	link.setAttribute("href", filename);
	head.appendChild(link);
}

/*
 * removeStylesheet(file)
 * usage: removeStylesheet(filename.css);
 * 
 */
 
function removeStylesheet(filename) {
	var stylesheets=document.getElementsByTagName("link");
	for (var i=stylesheets.length; i>=0; i--) { 
		if (stylesheets[i] && stylesheets[i].getAttribute("href")!=null && stylesheets[i].getAttribute("href").indexOf(filename)!=-1) {
			stylesheets[i].parentNode.removeChild(stylesheets[i]); 
		}
	}
}