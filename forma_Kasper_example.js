import proj4 from "proj4";
// Can get this from Forma.project.get() (projString)
const siteProj = "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs";
// Can get this from Forma.project.get() (refPoint)
// All geometry is relative to this position.
// E.g. something rendered at 0,0 will have this position in the UTM system above.
const siteRefPoint = [596714.1683692607, 6643490.173700893];
// https://epsg.io/4326
const projWgs84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";
// WGS 84 for 0,0:
// (Note this uses the order long,lat and not lat,long - think x(long),y(lat))
console.log(proj4(siteProj, projWgs84, siteRefPoint));
// Output: [ 10.729750009845244, 59.91753022729934 ]
// Example WGS 84 coordinates to place something at
const lon = 10.730103;
const lat = 59.9192151;
// Convert to destination system
const converted = proj4(projWgs84, siteProj, [lon, lat]);
console.log(converted);
// Output: [ 596728.998681161, 6643678.284972506 ]
// Offset by site position to find the final position in the site
const position = [
converted[0] - siteRefPoint[0],
converted[1] - siteRefPoint[1],
];
console.log(position);
// Output: [ 14.830311900237575, 188.11127161234617 ]
// Something placed at this point in the site is the exact same point
// as GPS (WGS 84) coordinates 10.730103, 59.9192151
// Example to get the proper position of geometry:
// A point in a GLB placed at x=10, in an element that is placed
// with a transform of x=3, will end up being rendered at x=13 from
// the center (0,0) of the site.
// In most cases the position 0,0 within a GLB is what ends up being placed
// at a desired position, by having a transform with the offset above
// (14.830311900237575, 188.11127161234617).