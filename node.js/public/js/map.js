var svgns = "http://www.w3.org/2000/svg";
var xlinkns = "http://www.w3.org/1999/xlink";
var id, currentLocation;  
var roomsCounter = {};
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
	moveUser(data.left.shortname, data.entered.shortname, data.user);
	setTimeout(function() {
	    updateCounter(data.left.shortname, -1);
	    updateCounter(data.entered.shortname, +1);
	    
	    if (data.you) {
		youarehere(data.entered.shortname);
	    }
	}, 3000);
    };
}


function moveUser (left, entered, user) {
    var avatarId = "avatar_" + user.login;
    var avatar = document.getElementById(avatarId);
    var leftBox = document.getElementById(left).getBBox();
    var enteredBox = document.getElementById(entered).getBBox();

    if (!avatar) {
	var name = document.createTextNode(user.given + " " + user.family);
	if (user.picture_thumb) {
	    avatar = document.createElementNS(svgns, "image");
	    avatar.setAttribute("width",36);
	    avatar.setAttribute("height",48);
	    avatar.setAttributeNS(xlinkns, "href", user.picture_thumb);
	    var title = document.createElementNS(svgns, "title");
	    title.appendChild(name);
	    avatar.appendChild(title);
	} else {
	    avatar = document.createElementNS(svgns, "text");
	    avatar.setAttribute("text-anchor", "middle");
	    avatar.appendChild(name);
	}
	avatar.setAttribute("id",avatarId);
	avatar.setAttribute("x", leftBox.x + leftBox.width / 2);
	avatar.setAttribute("y", leftBox.y + leftBox.height / 2);
	var animateFadein = document.createElementNS(svgns, "animate");
	var animateFadeout;
	var animateX = document.createElementNS(svgns, "animate");
	var animateY = document.createElementNS(svgns, "animate");
	animateFadein.setAttribute("attributeName", "opacity");
	animateFadein.setAttribute("from", "0");
	animateFadein.setAttribute("to", "1");
	animateFadein.setAttribute("dur", "0.5s");
	animateFadein.setAttribute("fill", "freeze");
	animateFadein.setAttribute("id", user.login + "_fadein");
	animateFadein.setAttribute("begin", avatarId + ".load");
	animateFadeout = animateFadein.cloneNode(true);
	animateFadeout.setAttribute("from", "1");
	animateFadeout.setAttribute("to", "0");
	animateFadeout.setAttribute("begin", user.login + "_moveX.end");
	animateX.setAttribute("attributeName", "x");
	animateX.setAttribute("from", leftBox.x + leftBox.width / 2);
	animateX.setAttribute("to", enteredBox.x + enteredBox.width / 2);
	animateX.setAttribute("dur", "2s");
	animateX.setAttribute("fill", "freeze");
	animateX.setAttribute("id", user.login + "_moveX");
	animateX.setAttribute("begin", user.login + "_fadein.end");
	animateY.setAttribute("attributeName", "y");
	animateY.setAttribute("id", user.login + "_moveY");
	animateY.setAttribute("from", leftBox.y + leftBox.height / 2);
	animateY.setAttribute("to", enteredBox.y + enteredBox.height / 2);
	animateY.setAttribute("dur", "2s");
	animateY.setAttribute("begin", user.login + "_fadein.end");
	animateY.setAttribute("fill", "freeze");
	avatar.appendChild(animateX);
	avatar.appendChild(animateY);
	avatar.appendChild(animateFadein);
	avatar.appendChild(animateFadeout);
	document.documentElement.appendChild(avatar);

    } else {
	var animateX = document.getElementById(user.login + "_moveX");
	animateX.setAttribute("from", leftBox.x + leftBox.width / 2);
	animateX.setAttribute("to", enteredBox.x + enteredBox.width / 2);
	var animateY = document.getElementById(user.login + "_moveY");
	animateY.setAttribute("from", leftBox.y + leftBox.height / 2);
	animateY.setAttribute("to", enteredBox.y + enteredBox.height / 2);
	avatar.setAttribute("x", leftBox.x + leftBox.width / 2);
	avatar.setAttribute("y", leftBox.y + leftBox.height / 2);	
	reloadAvatar = avatar.cloneNode(true);
	document.documentElement.removeChild(avatar);
	document.documentElement.appendChild(reloadAvatar);
    }
}

function updateCounter(roomid, counterIncrement) {       
    var room = document.getElementById( roomid);
    var counterText = document.getElementById( roomid +  "-counter");
    var counterBackdrop = document.getElementById( roomid +  "-counter-backdrop");
    if (!roomsCounter[roomid]) {
	roomsCounter[roomid] = 0;
    }
    roomsCounter[roomid] += counterIncrement;
    var newCounter = roomsCounter[roomid];
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

