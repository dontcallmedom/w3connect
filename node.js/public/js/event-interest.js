jQuery(document).ready(function ($) {

    $("a.interest").live("click", function () {
        var self = $(this),
            postData = {"_format": "json"};

        if ($("img", self).attr("src").indexOf("-off") !== -1) {
            postData.interested = "interested";
        } else {
            postData.uninterested = "uninterested";
        }

        $.post(
            self.attr("href"),
            postData,
            function (data) {
                // data.error vs data.success
                var result = JSON.parse(data);
                if (result.success) {
                    if (postData.uninterested) {
                        var img = $("img", ".interest[href='" + self.attr("href") + "']");
                        img.attr("src", $("img", self).attr("src").replace(".png", "-off.png"));
                        img.attr("alt", "Not marked as interested");
                        $(".mySchedule .interest[href='" + self.attr("href") + "']").parent().remove();
                    } else {
                        $("img", self).attr("src", $("img", self).attr("src").replace("-off.png", ".png"));
                        $("img", self).attr("alt", "Marked as interested");
                        var event = self.parent().clone();
                        $(".mySchedule").append(event);
                    }
                }
            }
        );
        return false;
    });

    if (window.EventSource) {
        var evtSrc = new EventSource("stream");
        evtSrc.addEventListener("interest", function (e) {
            var data = JSON.parse(e.data);
            $(".interested[data-eventid='" + data.event.slug + "']").each(function () {
                var interested = $(this),
                    counterElem = $(".counter", interested);
                if (counterElem.size() > 0) {
                    var counter = parseInt(counterElem.text(), 10) || 0;
                    counterElem.text(counter + 1);
                } else {
                    counterElem = $('<span class="counter label" rel="tooltip"></span>');
                    counterElem.attr('data-original-title', '1 interested to attend');
                    counterElem.text('1');
                    interested.append(counterElem);
                    counterElem.tooltip();
                }
            });
        }, false);
        evtSrc.addEventListener("uninterest", function (e) {
            var data = JSON.parse(e.data);
            $(".interested[data-eventid='" + data.event.slug + "']").each(function () {
                var interested = $(this),
                    counterElem = $(".counter", interested);
                if (counterElem.size() > 0) {
                    var counter = parseInt(counterElem, 10);
                    if (counter > 1) {
                        counterElem.text(counter - 1);
                        counterElem.attr('data-original-title', (counter - 1) + ' interested to attend');
                    } else {
                        counterElem.remove();
                    }
                }
            });
        }, false);
    }

});