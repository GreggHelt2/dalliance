// 
// Dalliance Genome Explorer
// (c) Thomas Down 2006-2010
//
// feature-tier.js: renderers for glyphic data
//

var MIN_FEATURE_PX = 1; // FIXME: slightly higher would be nice, but requires making
                        // drawing of joined-up groups a bit smarter.   

//
// Colour handling
//

function DColour(red, green, blue, name) {
    this.red = red|0;
    this.green = green|0;
    this.blue = blue|0;
    if (name) {
	this.name = name;
    }
}

DColour.prototype.toSvgString = function() {
    if (!this.name) {
	this.name = "rgb(" + this.red + "," + this.green + "," + this.blue + ")";
    }

    return this.name;
}

var palette = {
    red: new DColour(255, 0, 0, 'red'),
    green: new DColour(0, 255, 0, 'green'),
    blue: new DColour(0, 0, 255, 'blue'),
    yellow: new DColour(255, 255, 0, 'yellow'),
    white: new DColour(255, 255, 255, 'white'),
    black: new DColour(0, 0, 0, 'black'),
};

function dasColourForName(name) {
    var c = palette[name];
    if (!c) {
	alert("couldn't handle color: " + name);
    }
    return c;
}

// 
// Wrapper for glyph plus metrics
//

function DGlyph(glyph, min, max, height) {
    this.glyph = glyph;
    this.min = min;
    this.max = max;
    this.height = height;
}

//
// Set of bumped glyphs
// 

function DSubTier() {
    this.glyphs = [];
    this.height = 0;
}

DSubTier.prototype.add = function(glyph) {
    this.glyphs.push(glyph);
    this.height = Math.max(this.height, glyph.height);
}

DSubTier.prototype.hasSpaceFor = function(glyph) {
    for (var i = 0; i < this.glyphs.length; ++i) {
	var g = this.glyphs[i];
	if (g.min <= glyph.max && g.max >= glyph.min) {
	    return false;
	}
    }
    return true;
}



function drawLine(featureGroupElement, features, style, tier)
{
    var height = style.HEIGHT || 30;
    var min = style.MIN || 0, max = style.MAX || 100;
    var yscale = ((1.0 * height) / (max - min));
    var width = style.LINEWIDTH || 1;
    var color = style.COLOR || style.COLOR1 || 'black';

    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute('stroke', color);
    path.setAttribute("stroke-width", width);
    var pathOps = '';

    for (var fi = 0; fi < features.length; ++fi) {
	var f = features[fi];

	var px = ((((f.min|0) + (f.max|0)) / 2) - origin) * scale;
        var sc = (f.score * yscale)|0;
	var py = 0 + height - sc;
	if (fi == 0) {
	    pathOps = 'M ' + px + ' ' + py;
	} else {
	    pathOps += ' L ' + px + ' ' + py;
	}	
    }
    path.setAttribute('d', pathOps);
    featureGroupElement.appendChild(path);
   
    return height;
}

function pusho(obj, k, v) {
    if (obj[k]) {
	obj[k].push(v);
    } else {
	obj[k] = new Array(v);
    }
}

function sortFeatures(tier)
{
    var ungroupedFeatures = {};
    var groupedFeatures = {};
    var groups = {};
    
    for (var fi = 0; fi < tier.currentFeatures.length; ++fi) {
	var f = tier.currentFeatures[fi];
	var wasGrouped = false;
	if (f.groups) {
	    for (var gi = 0; gi < f.groups.length; ++gi) {
	        var g = f.groups[gi];
	        if (g.type == 'transcript' || g.type=='CDS' || g.type == 'read') {
	            var gid = g.id;
		    pusho(groupedFeatures, gid, f);
	            groups[gid] = g;
		    wasGrouped = true;
	        }
	    }
	}

	if (!wasGrouped) {
	    pusho(ungroupedFeatures, f.type, f);
	}
    }

    tier.ungroupedFeatures = ungroupedFeatures;
    tier.groupedFeatures = groupedFeatures;
    tier.groups = groups;
}

var clipIdSeed = 0;

function drawFeatureTier(tier)
{
    sortFeatures(tier);
    tier.placard = null;

    var featureGroupElement = tier.viewport;
    while (featureGroupElement.childNodes.length > 0) {
	featureGroupElement.removeChild(featureGroupElement.firstChild);
    }
    featureGroupElement.appendChild(tier.background);
	
    var offset = 2;
    var lh = 2;
    var bumpMatrix = null;
    if (tier.bumped) {
	bumpMatrix = new Array(0);
    }
    var styles = tier.styles(scale);

    var glyphs = [];
    var specials = false;

    // Glyphify ungrouped.
	
    for (var uft in tier.ungroupedFeatures) {
	var ufl = tier.ungroupedFeatures[uft];
	var style = styles[uft] || styles['default'];
	if (!style) continue;
	if (style.glyph == 'LINEPLOT') {
	    lh = Math.max(drawLine(featureGroupElement, ufl, style, tier));
	    specials = true;
	} else {
	    for (var pgid = 0; pgid < ufl.length; ++pgid) {
		var g = glyphForFeature(ufl[pgid], offset, style);
		glyphs.push(g);
	    }
	}
    }

    // Glyphify groups.

    var gl = new Array();
    for (var gid in tier.groupedFeatures) {
	gl.push(gid);
    }
    gl.sort(function(g1, g2) {
	var d = tier.groupedFeatures[g1][0].score - tier.groupedFeatures[g2][0].score;
	if (d > 0) {
	    return -1;
        } else if (d = 0) {
	    return 0;
        } else {
	    return 1;
        }
    });
    for (var gx in gl) {
	var gid = gl[gx];
	var g = glyphsForGroup(tier.groupedFeatures[gid], offset, styles, tier.groups[gid]);
	glyphs.push(g);
    }

    var unbumpedST = new DSubTier();
    var bumpedSTs = [];
    
  GLYPH_LOOP:
    for (var i = 0; i < glyphs.length; ++i) {
	var g = glyphs[i];
	g = labelGlyph(g);
	if (g.bump) {
	    for (var sti = 0; sti < bumpedSTs.length;  ++sti) {
		var st = bumpedSTs[sti];
		if (st.hasSpaceFor(g)) {
		    st.add(g);
		    continue GLYPH_LOOP;
		}
	    }
	    var st = new DSubTier();
	    st.add(g);
	    bumpedSTs.push(st);
	} else {
	    unbumpedST.add(g);
	}
    }

    if (unbumpedST.glyphs.length > 0) {
	bumpedSTs = [unbumpedST].concat(bumpedSTs);
    }

    var stBoundaries = [];
    if (specials) {
	stBoundaries.push(lh);
    } 
    for (var bsi = 0; bsi < bumpedSTs.length; ++bsi) {
	var st = bumpedSTs[bsi];
	for (var i = 0; i < st.glyphs.length; ++i) {
	    var g = st.glyphs[i];
	    if (g.glyph) {
		g.glyph.setAttribute('transform', 'translate(0, ' + lh + ')');
		featureGroupElement.appendChild(g.glyph);
	    }
	}
	lh += st.height + 4; //padding
	stBoundaries.push(lh);
    }

    lh = Math.max(20, lh); // for sanity's sake.
    if (stBoundaries.length < 2) {
	var bumped = false;
	var minHeight = lh;
	for (s in styles) {
	    if (s.bump) {
		bumped = true;
	    }
	    if (s.height && (4.0 + s.height) > minHeight) {
		minHeight = (4.0 + s.height);
	    }
	}
	if (bumped) {
	    lh = 2 * minHeight;
	}
    }				

    if (!tier.layoutWasDone) {
	tier.layoutHeight = lh + 4;
	tier.background.setAttribute("height", lh);
	if (glyphs.length > 0 || specials) {
	    tier.layoutWasDone = true;
	}
	tier.placard = null;
    } else {
	if (tier.layoutHeight != (lh + 4)) {
	    var spandPlacard = document.createElementNS(NS_SVG, 'g');
	    var frame = document.createElementNS(NS_SVG, 'rect');
	    frame.setAttribute('x', 0);
	    frame.setAttribute('y', -20);
	    frame.setAttribute('width', featurePanelWidth);
	    frame.setAttribute('height', 20);
	    frame.setAttribute('stroke', 'red');
	    frame.setAttribute('stroke-width', 1);
	    frame.setAttribute('fill', 'white');
	    spandPlacard.appendChild(frame);
	    var spand = document.createElementNS(NS_SVG, 'text');
	    spand.setAttribute('stroke', 'none');
	    spand.setAttribute('fill', 'red');

	    if (tier.layoutHeight < (lh+4)) { 
		var dispST = 0;
		while ((tier.layoutHeight - 20) >= stBoundaries[dispST]) { // NB allowance for placard!
		    ++dispST;
		}
		spand.appendChild(document.createTextNode('Show ' + (stBoundaries.length - dispST) + ' more'));
	    } else {
		spand.appendChild(document.createTextNode('Show less'));
	    }
	    
	    spand.setAttribute('x', 80);
	    spand.setAttribute('y', -6);
	    spandPlacard.appendChild(spand);
	    var arrow = document.createElementNS(NS_SVG, 'path');
	    arrow.setAttribute('fill', 'red');
	    arrow.setAttribute('stroke', 'none');
	    if (tier.layoutHeight < (lh+4)) {
		arrow.setAttribute('d', 'M ' +  30 + ' ' + -16 +
				   ' L ' + 42 + ' ' + -16 +
				   ' L ' + 36 + ' ' + -4 + ' Z');
	    } else {
		arrow.setAttribute('d', 'M ' +  30 + ' ' + -4 +
				   ' L ' + 42 + ' ' + -4 +
				   ' L ' + 36 + ' ' + -16 + ' Z');
	    }
	    spandPlacard.appendChild(arrow);
	    
	    spandPlacard.addEventListener('mousedown', function(ev) {
		tier.layoutWasDone = false;
		drawFeatureTier(tier);
		arrangeTiers();
	    }, false);
	    tier.placard = spandPlacard;
	} 
    }

    var statusMsg = tier.error || tier.status;
    if (statusMsg != null) {
	var statusPlacard = document.createElementNS(NS_SVG, 'g');
	var frame = document.createElementNS(NS_SVG, 'rect');
	frame.setAttribute('x', 0);
	frame.setAttribute('y', -20);
	frame.setAttribute('width', featurePanelWidth);
	frame.setAttribute('height', 20);
	frame.setAttribute('stroke', 'red');
	frame.setAttribute('stroke-width', 1);
	frame.setAttribute('fill', 'white');
	statusPlacard.appendChild(frame);
	var status = document.createElementNS(NS_SVG, 'text');
	status.setAttribute('stroke', 'none');
	status.setAttribute('fill', 'red');
	status.setAttribute('x', 80);
	status.setAttribute('y', -6);
	status.appendChild(document.createTextNode(statusMsg));
	statusPlacard.appendChild(status);
	tier.placard = statusPlacard;
    }


    var clipId = 'tier_clip_' + (++clipIdSeed);
    var clip = document.createElementNS(NS_SVG, 'clipPath');
    clip.setAttribute('id', clipId);
    var clipRect = document.createElementNS(NS_SVG, 'rect');
    clipRect.setAttribute('x', -500000);
    clipRect.setAttribute('y', 0);
    clipRect.setAttribute('width', 1000000);
    clipRect.setAttribute('height', tier.layoutHeight - 4);
    clip.appendChild(clipRect);
    featureGroupElement.appendChild(clip);
    featureGroupElement.setAttribute('clip-path', 'url(#' + clipId + ')');
	    
    tier.scale = 1;
}

function glyphsForGroup(features, y, stylesheet, groupElement) {
    var height=1;
    var label;
    var spans = null;
    var strand = null;
    
    var glyphGroup = document.createElementNS(NS_SVG, 'g');
    for (var i = 0; i < features.length; ++i) {
	var feature = features[i];
	if (feature.orientation && strand==null) {
	    strand = feature.orientation;
	}
	var style = stylesheet[feature.type];
	if (!style) {
	    continue;
	}
	var glyph = glyphForFeature(feature, y, style);
	if (glyph && glyph.glyph) {
	    glyphGroup.appendChild(glyph.glyph);
	    var gspan = new Range(glyph.min, glyph.max);
	    if (spans == null) {
		spans = gspan;
	    } else {
		spans = union(spans, gspan);
	    }
	    height = Math.max(height, glyph.height);
	    if (!label && glyph.label) {
		label = glyph.label;
	    }
	}
    }

    var blockList = spans.ranges();
    for (var i = 1; i < blockList.length; ++i) {
	var lmin = (blockList[i - 1].max() - origin) * scale;
	var lmax = (blockList[i].min() - origin) * scale;

	var path = document.createElementNS(NS_SVG, 'path');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke-width', '1');
	    
	if (strand == "+" || strand == "-") {
	    var lmid = (lmin + lmax) / 2;
	    var lmidy = (strand == "-") ? y + 12 : y;
	    path.setAttribute("d", "M " + lmin + " " + (y + 6) + " L " + lmid + " " + lmidy + " L " + lmax + " " + (y + 6));
	} else {
	    path.setAttribute("d", "M " + lmin + " " + (y + 6) + " L " + lmax + " " + (y + 6));
	}
	    
	glyphGroup.appendChild(path);
    }

    //
    // popup code ported from old renderer.
    // FIXME: is this really the place?
    //
    if (groupElement && groupElement.links) {
	var timeoutID = null;
	glyphGroup.addEventListener('mousedown', function(ev) {
	    if (timeoutID) {
		clearTimeout(timeoutID);
		viewStart = ((1.0 *spans.min()) - 2000)|0;
		viewEnd = ((1.0 * spans.max()) + 2000)|0;
		scale = featurePanelWidth / (viewEnd - viewStart)
		updateRegion();
		refresh();
	    } else {
		var link = '';
		for (var li = 0; li < groupElement.links.length; ++li) {
	            var dasLink = groupElement.links[li];
	            // link += ' <a href="' + dasLink.uri + '">(' + dasLink.desc + ')</a>';
		}
		var mx = ev.clientX, my = ev.clientY;
		// alert('doGenePopup("' + label + '", "' + link + '", ' + mx + ', ' + my + ');');
		timeoutID = setTimeout('doGenePopup("' + label + '", "' + link + '", ' + mx + ', ' + my + ');', 500);
	    } 
	    	            

	}, true); 
    }

    var dg = new DGlyph(glyphGroup, spans.min(), spans.max(), height);
    dg.strand = strand;
    dg.bump = true; // grouped features always bumped.
    if (label) {
	dg.label = label;
    }
    return dg;
}

function doGenePopup(label, link, mx, my) {
	    removeAllPopups();
	    mx +=  document.documentElement.scrollLeft || document.body.scrollLeft;
	    my +=  document.documentElement.scrollTop || document.body.scrollTop;
	    var popup = $('#popupTest').clone().css({
	        position: 'absolute', 
	        top: (my - 10), 
	        left:  (mx - 10),
	        width: 200,
	        backgroundColor: 'white',
	        borderColor: 'black',
	        borderWidth: 1,
	        borderStyle: 'solid',
	        padding: 2,
	    }).html('Gene: ' + label + link).get(0);
	    $(popup).hide();
	    hPopupHolder.appendChild(popup);
	    $(popup).fadeIn(500);
	            
/*
	    popup.addEventListener('mouseout', function(ev2) {
	        var rel = ev2.relatedTarget;
	        while (rel) {
	            if (rel == popup) {
	                return;
	            }
	            rel = rel.parentNode;
	        }
	        removeAllPopups();
	    }, false); */
}

function glyphForFeature(feature, y, style)
{
    var gtype = style.glyph || 'BOX';
    var glyph;

    var min = feature.min;
    var max = feature.max;
    var type = feature.type;
    var strand = feature.orientation;
    var score = feature.score;
    var label = feature.label;

    var minPos = (min - origin) * scale;
    var maxPos = (max - origin) * scale;

    var requiredHeight;

    if (gtype == 'HIDDEN') {
	glyph = null;
    } else if (gtype == 'CROSS' || gtype == 'EX' || gtype == 'SPAN' || gtype == 'DOT' || gtype == 'TRIANGLE') {
	var stroke = style.FGCOLOR || 'black';
	var fill = style.BGCOLOR || 'none';
	var height = style.HEIGHT || 12;
	requiredHeight = height = 1.0 * height;

	var mid = (minPos + maxPos)/2;
	var hh = height/2;

	var mark;

	if (gtype == 'CROSS') {
	    mark = document.createElementNS(NS_SVG, 'path');
	    mark.setAttribute('fill', 'none');
	    mark.setAttribute('stroke', stroke);
	    mark.setAttribute('stroke-width', 1);
	    mark.setAttribute('d', 'M ' + (mid-hh) + ' ' + (y+hh) + 
			      ' L ' + (mid+hh) + ' ' + (y+hh) + 
			      ' M ' + mid + ' ' + y +
			      ' L ' + mid + ' ' + (y+height));
	} else if (gtype == 'EX') {
	    mark = document.createElementNS(NS_SVG, 'path');
	    mark.setAttribute('fill', 'none');
	    mark.setAttribute('stroke', stroke);
	    mark.setAttribute('stroke-width', 1);
	    mark.setAttribute('d', 'M ' + (mid-hh) + ' ' + (y) + 
			      ' L ' + (mid+hh) + ' ' + (y+height) + 
			      ' M ' + (mid+hh) + ' ' + (y) +
			      ' L ' + (mid-hh) + ' ' + (y+height));  
	} else if (gtype == 'SPAN') {
	    mark = document.createElementNS(NS_SVG, 'path');
	    mark.setAttribute('fill', 'none');
	    mark.setAttribute('stroke', stroke);
	    mark.setAttribute('stroke-width', 1);
	    mark.setAttribute('d', 'M ' + minPos + ' ' + (y+hh) +
			      ' L ' + maxPos + ' ' + (y+hh) +
			      ' M ' + minPos + ' ' + y +
			      ' L ' + minPos + ' ' + (y + height) +
			      ' M ' + maxPos + ' ' + y +
			      ' L ' + maxPos + ' ' + (y + height));
	} else if (gtype == 'DOT') {
	    mark = document.createElementNS(NS_SVG, 'circle');
	    mark.setAttribute('fill', stroke);   // yes, really...
	    mark.setAttribute('stroke', 'none');
	    mark.setAttribute('cx', mid);
	    mark.setAttribute('cy', (y+hh));
	    mark.setAttribute('r', hh);
	}  else if (gtype == 'TRIANGLE') {
	    var dir = style.DIRECTION || 'N';
	    var width = style.LINEWIDTH || height;
	    halfHeight = 0.5 * height;
	    halfWidth = 0.5 * width;
	    mark = document.createElementNS(NS_SVG, 'path');
	    if (dir == 'E') {
	    mark.setAttribute('d', 'M ' + (mid - halfWidth) + ' ' + 0 + 
			      ' L ' + (mid - halfWidth) + ' ' + height +
			      ' L ' + (mid + halfWidth) + ' ' + halfHeight + ' Z');
	    } else if (dir == 'W') {
		mark.setAttribute('d', 'M ' + (mid + halfWidth) + ' ' + 0 + 
				  ' L ' + (mid + halfWidth) + ' ' + height +
				  ' L ' + (mid - halfWidth) + ' ' + halfHeight + ' Z');
	    } else if (dir == 'S') {
		mark.setAttribute('d', 'M ' + (mid + halfWidth) + ' ' + 0 + 
				  ' L ' + (mid - halfWidth) + ' ' + 0 +
				  ' L ' + mid + ' ' + height + ' Z');
	    } else {
		mark.setAttribute('d', 'M ' + (mid + halfWidth) + ' ' + height + 
				  ' L ' + (mid - halfWidth) + ' ' + height +
				  ' L ' + mid + ' ' + 0 + ' Z');
	    }
	    mark.setAttribute('fill', stroke);
	    mark.setAttribute('stroke', 'none');
	}

	if (fill == 'none') {
	    glyph = mark;
	} else {
	    glyph = document.createElementNS(NS_SVG, 'g');
	    var bg = document.createElementNS(NS_SVG, 'rect');
	    bg.setAttribute('x', minPos);
            bg.setAttribute('y', y);
            bg.setAttribute('width', maxPos - minPos);
            bg.setAttribute('height', height);
	    bg.setAttribute('stroke', 'none');
	    bg.setAttribute('fill', fill);
	    glyph.appendChild(bg);
	    glyph.appendChild(mark);
	}
    } else if (gtype == 'PRIMERS') {
	var arrowColor = style.FGCOLOR || 'red';
	var lineColor = style.BGCOLOR || 'black';
	var height = style.HEIGHT || 12;
	requiredHeight = height = 1.0 * height;

	var mid = (minPos + maxPos)/2;
	var hh = height/2;

	var glyph = document.createElementNS(NS_SVG, 'g');
	var line = document.createElementNS(NS_SVG, 'path');
	line.setAttribute('stroke', lineColor);
	line.setAttribute('fill', 'none');
	line.setAttribute('d', 'M ' + minPos + ' ' + (height/2) + ' L ' + maxPos + ' ' + (height/2));
	glyph.appendChild(line);

	var trigs = document.createElementNS(NS_SVG, 'path');
	trigs.setAttribute('stroke', 'none');
	trigs.setAttribute('fill', 'arrowColor');
	trigs.setAttribute('d', 'M ' + minPos + ' ' + 0 + ' L ' + minPos + ' ' + height + ' L ' + (minPos + height) + ' ' + (height/2) + ' Z ' +
	    		        'M ' + maxPos + ' ' + 0 + ' L ' + maxPos + ' ' + height + ' L ' + (maxPos - height) + ' ' + (height/2) + ' Z');
	glyph.appendChild(trigs);
    } else if (gtype == 'ARROW') {
	var stroke = style.FGCOLOR || 'none';
	var fill = style.BGCOLOR || 'green';
	var height = style.HEIGHT || 12;
	requiredHeight = height = 1.0 * height;
	var headInset = 0.5 *height;
	var minLength = height + 2;
	var instep = 0.333333 * height;
	
        if (maxPos - minPos < minLength) {
            minPos = (maxPos + minPos - minLength) / 2;
            maxPos = minPos + minLength;
        }

	var path = document.createElementNS(NS_SVG, 'path');
	path.setAttribute('fill', fill);
	path.setAttribute('stroke', stroke);
	if (stroke != 'none') {
	    path.setAttribute('stroke-width', 1);
	}
	
	path.setAttribute('d', 'M ' + ((minPos + headInset)) + ' ' + ((y+instep)) +
                          ' L ' + ((maxPos - headInset)) + ' ' + ((y+instep)) +
			  ' L ' + ((maxPos - headInset)) + ' ' + (y) +
			  ' L ' + (maxPos) + ' ' + ((y+(height/2))) +
			  ' L ' + ((maxPos - headInset)) + ' ' + ((y+height)) +
			  ' L ' + ((maxPos - headInset)) + ' ' + ((y + instep + instep)) +
			  ' L ' + ((minPos + headInset)) + ' ' + ((y + instep + instep)) +
			  ' L ' + ((minPos + headInset)) + ' ' + ((y + height)) +
			  ' L ' + (minPos) + ' ' + ((y+(height/2))) +
			  ' L ' + ((minPos + headInset)) + ' ' + (y) +
			  ' L ' + ((minPos + headInset)) + ' ' + ((y+instep)));

	glyph = path;
    } else if (gtype == 'ANCHORED_ARROW') {
	var stroke = style.FGCOLOR || 'none';
	var fill = style.BGCOLOR || 'green';
	var height = style.HEIGHT || 12;
	requiredHeight = height = 1.0 * height;
	var lInset = 0;
	var rInset = 0;
	var minLength = height + 2;
	var instep = 0.333333 * height;
	

	if (feature.orientation) {
	    if (feature.orientation == '+') {
		rInset = height/2;
	    } else if (feature.orientation == '-') {
		lInset = height/2;
	    }
	}

        if (maxPos - minPos < minLength) {
            minPos = (maxPos + minPos - minLength) / 2;
            maxPos = minPos + minLength;
        }

	var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("fill", fill);
	path.setAttribute('stroke', stroke);
	if (stroke != 'none') {
	    path.setAttribute("stroke-width", 1);
	}
	
	path.setAttribute('d', 'M ' + ((minPos + lInset)) + ' ' + ((y+instep)) +
                          ' L ' + ((maxPos - rInset)) + ' ' + ((y+instep)) +
			  ' L ' + ((maxPos - rInset)) + ' ' + (y) +
			  ' L ' + (maxPos) + ' ' + ((y+(height/2))) +
			  ' L ' + ((maxPos - rInset)) + ' ' + ((y+height)) +
			  ' L ' + ((maxPos - rInset)) + ' ' + ((y + instep + instep)) +
			  ' L ' + ((minPos + lInset)) + ' ' + ((y + instep + instep)) +
			  ' L ' + ((minPos + lInset)) + ' ' + ((y + height)) +
			  ' L ' + (minPos) + ' ' + ((y+(height/2))) +
			  ' L ' + ((minPos + lInset)) + ' ' + (y) +
			  ' L ' + ((minPos + lInset)) + ' ' + ((y+instep)));

	glyph = path;
    } else {
	// BOX (plus some other rectangular stuff...)
    
	var stroke = style.FGCOLOR || 'none';
	var fill = style.BGCOLOR || 'green';
	var height = style.HEIGHT || 12;
	requiredHeight = height = 1.0 * height;

        if (maxPos - minPos < MIN_FEATURE_PX) {
            minPos = (maxPos + minPos - MIN_FEATURE_PX) / 2;
            maxPos = minPos + MIN_FEATURE_PX;
        }

	if ((gtype == 'HISTOGRAM' || gtype == 'GRADIENT') && score && style.COLOR2) {
	    var smin = style.MIN || 0;
	    var smax = style.MAX || 100;
	    if ((1.0 * score) < smin) {
		score = smin;
	    }
	    if ((1.0 * score) > smax) {
		score = smax;
	    }
	    var relScore = ((1.0 * score) - smin) / (smax-smin);

	    var loc, hic, frac;
	    if (style.COLOR3) {
		if (relScore < 0.5) {
		    loc = dasColourForName(style.COLOR1);
		    hic = dasColourForName(style.COLOR2);
		    frac = relScore * 2;
		} else {
		    loc = dasColourForName(style.COLOR2);
		    hic = dasColourForName(style.COLOR3);
		    frac = (relScore * 2.0) - 1.0;
		}
	    } else {
		loc = dasColourForName(style.COLOR1);
		hic = dasColourForName(style.COLOR2);
		frac = relScore;
	    }

	    fill = new DColour(
		((loc.red * (1.0 - frac)) + (hic.red * frac))|0,
		((loc.green * (1.0 - frac)) + (hic.green * frac))|0,
		((loc.blue * (1.0 - frac)) + (hic.blue * frac))|0
	    ).toSvgString();

	    if (gtype == 'HISTOGRAM') {
		height = (height * relScore)|0;
		y = y + (requiredHeight - height);
	    }
	}
 
        var rect = document.createElementNS(NS_SVG, 'rect');
        rect.setAttribute('x', minPos);
        rect.setAttribute('y', y);
        rect.setAttribute('width', maxPos - minPos);
        rect.setAttribute('height', height);
	rect.setAttribute('stroke', stroke);
        rect.setAttribute('stroke-width', 1);
	rect.setAttribute('fill', fill);
	
	glyph = rect;
    }


    var dg = new DGlyph(glyph, min, max, requiredHeight);
    if (style.LABEL && feature.label) {
	dg.label = feature.label;
    }
    if (style.BUMP) {
	dg.bump = true;
    }
    dg.strand = feature.orientation || '0';

    return dg;
}

function labelGlyph(dglyph) {
    if (dglyph.glyph && dglyph.label) {
	var label = dglyph.label;
	var labelText = document.createElementNS(NS_SVG, 'text');
	labelText.setAttribute('x', (dglyph.min - origin) * scale);
	labelText.setAttribute('y', dglyph.height + 20);
	labelText.setAttribute('stroke-width', 0);
	labelText.setAttribute('fill', 'black');
	labelText.setAttribute('class', 'label-text');
	if (dglyph.strand == '+') {
	    label = label + '>';
	} else if (dglyph.strand == '-') {
	    label = '<' + label;
        }
	labelText.appendChild(document.createTextNode(label));

	var g;
	if (dglyph.glyph.localName == 'g') {
	    g = dglyph.glyph;
	} else {
	    g = document.createElementNS(NS_SVG, 'g');
	    g.appendChild(dglyph.glyph);
	}
	g.appendChild(labelText);
	dglyph.glyph = g;
	dglyph.height = dglyph.height + 20;
    }
    return dglyph;
}
