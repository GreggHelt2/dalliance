// 
// Dalliance Genome Explorer
// (c) Thomas Down 2006-2010
//
// tier.js: (try) to encapsulate the functionality of a browser tier.
//

function refreshTier_sequence()
{
    if (scale >= 1) {
	var tier = this;
        this.dasSource.sequence(
            new DASSegment(chr, knownStart, knownEnd),
            function(seqs) {
                drawSeqTier(tier, seqs[0]);  // FIXME: check array.
            }
        );
    } else {
        drawSeqTier(this);
    }
}

function refreshTier_features()
{	    
    var stylesheet = this.styles(scale);
    var fetchTypes = [];
    var inclusive = false;
    if (stylesheet) {
	for (tt in stylesheet) {
	    if (tt == 'default') {
		inclusive = true;
	    } else {
		fetchTypes.push(tt);
	    }
	}
    }
    
    var scaledQuantRes = targetQuantRes / scale;
    var maxBins = 1 + (((knownEnd - knownStart) / scaledQuantRes) | 0);

    if (inclusive || fetchTypes.length > 0) {
	var tier = this;
        this.dasSource.features(
	    new DASSegment(chr, knownStart, knownEnd),
	    {type: (inclusive ? null : fetchTypes), maxbins: maxBins},
	    function(features) {
                tier.currentFeatures = features;
                dasRequestComplete(tier);
	    }
        );
    } else {
	this.currentFeatures = [];
	dasRequestComplete(this);
    }
}


function dasRequestComplete(tier)
{
    drawFeatureTier(tier);
    arrangeTiers();
    setLoadingStatus();
}
