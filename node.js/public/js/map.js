var svgns = "http://www.w3.org/2000/svg";
var id, currentLocation;  
var youareherePoint = document.createElementNS(svgns, "circle");
youareherePoint.setAttribute( "r", "2px");
youareherePoint.setAttribute( "id", "you");
youareherePoint.setAttribute( "fill", "red");


function youarehere(roomid) {
    // removing marker from current location
    if (currentLocation) {
        var there = document.getElementById(currentLocation);
	if (there) {
	    there.setAttribute("class", "room");
	}
    }
    currentLocation = roomid;
    // and adding it to new location
    var here = document.getElementById(roomid);
    if (here) {
        here.setAttribute("class", "room youarehere");
        var bbox = here.getBBox();
        youareherePoint.setAttribute( "cx", bbox.x + bbox.width/2);
        youareherePoint.setAttribute( "cy", bbox.y + bbox.height/2);
        if (!document.getElementById("you")) {
            document.documentElement.appendChild(youareherePoint);
        }
    }
}

if (window.location.hash) {
    id = window.location.hash.substring(1).split(',')[0];
    currentLocation = window.location.hash.substring(1).split(',')[1];
    var room = document.getElementById(id);
    if (room) {
	room.parentNode.removeAttribute("xlink:href");
	room.style.fill = "yellow";
    }
    if (currentLocation) {
	youarehere(currentLocation);
    }
}

// finding the rooms via their links to decorate them with a counter box
var room_links = document.getElementsByTagNameNS(svgns, "a");
// adding the counter
for (var r =0 ;r < room_links.length ; r++) {
    var room = room_links[r].getElementsByTagNameNS(svgns, "rect")[0];
    var bbox = room.getBBox();
    var backdrop = document.createElementNS(svgns, "rect");
    backdrop.setAttribute("id", room.getAttribute("id") + "-counter-backdrop");
    backdrop.setAttribute("x", bbox.x + bbox.width - 8);
    backdrop.setAttribute("width", 6);
    backdrop.setAttribute("y", bbox.y + bbox.height - 9);
    backdrop.setAttribute("height", 7);
    var t = document.createElementNS(svgns, "text");
    t.setAttribute("id", room.getAttribute("id") + "-counter");
    t.setAttribute( "x", bbox.x + bbox.width - 6);
    t.setAttribute( "y", bbox.y + bbox.height - 3 );
    t.setAttribute( "font-size", "6px");
    t.setAttribute( "text-anchor", "right");    
    room_links[r].appendChild(backdrop);
    room_links[r].appendChild(t);
}
var xhr = new XMLHttpRequest;
xhr.open("GET","/locations.json", true);
xhr.onreadystatechange = function() {
    if (4 == xhr.readyState) {
        var json = JSON.parse(xhr.responseText);
        for ( var i = 0, len = json.length; len > i; i++ ) {
	    if (json[i].checkedin.length) {
		updateCounter( json[i].shortname, json[i].checkedin.length );
            } 
        }
    }
}
xhr.send();   

if (window.EventSource) {
    // Live update!
    var evtSrc = new EventSource( "/locations/stream" );
    evtSrc.onmessage = function( e ) {
	data = JSON.parse(e.data);
	updateCounter(data.left.shortname, -1);
	updateCounter(data.entered.shortname, +1);
	if (data.you) {
	    youarehere(data.entered.shortname);
	}
    };
}


function updateCounter(roomid, counterIncrement) {       
    var room = document.getElementById( roomid);
    var counterText = document.getElementById( roomid +  "-counter");
    var counterBackdrop = document.getElementById( roomid +  "-counter-backdrop");
    var counter = (counterText.textContent ? parseInt(counterText.textContent) : 0);
    var newCounter = counter + counterIncrement;
    if (room) {
        var roomTitle = room.parentNode.getAttribute("title");
	if (roomTitle.indexOf('(')) {
	    roomTitle = roomTitle.substring(0,roomTitle.indexOf('(') - 1);
	}
        if (newCounter > 0) {   
            room.parentNode.setAttribute('title', roomTitle + " (" + newCounter + " person" + (newCounter > 1 ? "s" : "") + " checked in)");
	    counterBackdrop.setAttribute( "fill", "white");
            counterText.textContent = newCounter;
	} else {
            counterText.textContent = "";
	    counterBackdrop.setAttribute( "fill", "none");
            room.parentNode.setAttribute('title', roomTitle);
        }
    }
}

