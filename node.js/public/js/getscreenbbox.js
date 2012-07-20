// An implementation of getScreenBBox, by Antoine Quint
// http://the.fuchsia-design.com/2006/12/getting-svg-elementss-full-bounding-box.html

function getScreenBBox_impl(element) {

  // macro to create an SVGPoint object
  function createPoint (x, y) {
    var point = document.documentElement.createSVGPoint();
    point.x = x;
    point.y = y;
    return point;
  }

  // macro to create an SVGRect object
  function createRect (x, y, width, height) {
    var rect = document.documentElement.createSVGRect();
    rect.x = x;
    rect.y = y;
    rect.width = width;
    rect.height = height;
    return rect; 
  }

  // get the complete transformation matrix
  var matrix = element.getScreenCTM();
  // get the bounding box of the target element
  var box = element.getBBox();

  // create an array of SVGPoints for each corner
  // of the bounding box and update their location
  // with the transform matrix
  var corners = [];
  var point = createPoint(box.x, box.y);
  corners.push( point.matrixTransform(matrix) );
  point.x = box.x + box.width;
  point.y = box.y;
  corners.push( point.matrixTransform(matrix) );
  point.x = box.x + box.width;
  point.y = box.y + box.height;
  corners.push( point.matrixTransform(matrix) );
  point.x = box.x;
  point.y = box.y + box.height;
  corners.push( point.matrixTransform(matrix) );
  var max = createPoint(corners[0].x, corners[0].y);
  var min = createPoint(corners[0].x, corners[0].y);

  // identify the new corner coordinates of the
  // fully transformed bounding box
  for (var i = 1; i < corners.length; i++) {
    var x = corners[i].x;
    var y = corners[i].y;
    if (x < min.x) {
      min.x = x;
    }
    else if (x > max.x) {
      max.x = x;
    }
    if (y < min.y) {
      min.y = y;
    }
    else if (y > max.y) {
      max.y = y;
    }
  }
  
  // return the bounding box as an SVGRect object
  return createRect(min.x, min.y, max.x - min.x, max.y - min.y);
}
