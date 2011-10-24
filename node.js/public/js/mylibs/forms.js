jQuery(document).ready(function ($) {
    $("form.client").ajaxForm({success: displayMessage, data: {"_format": "json"}, dataType: "json"});
    function displayMessage(response, status, xhr, form) {
	if (!$("#messages").length) {
	    form.prepend("<div id='messages'></div>");
	}
	if (response.error) {
	    $("#messages").append("<p></p>").addClass("error").text(response.error);
	} else if (response.success) {
	    $("#messages").append("<p></p>").addClass("success").text(response.success);
	}
    }
});