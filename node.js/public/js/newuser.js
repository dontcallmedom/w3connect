jQuery(document).ready(function ($) {
if (window.EventSource) {
	  var evtSrc = new EventSource( "/people/stream" );
	  evtSrc.onmessage = function( e ) {
	    var data = JSON.parse(e.data);
	      $("<img>").attr("src", data.user.picture_thumb).attr("alt", "Picture of " + data.user.given).appendTo($("<a></a>").attr("href", "/people/" + data.user.slug).text(data.user.given).appendTo($("<li></li>").appendTo($("#peopleList"))));
	      var info = $("<p></p>").addClass("info");
	      info.text(data.user.given + " has just registered");
	      $("#messages").append(info);
	      setTimeout(function() { info.remove(); }, 5000);
	      $("#peopleList").append();	    
	  }	  
}
});