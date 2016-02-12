'use strict';
/**
 * Take a WP route string (with PCRE named capture groups), such as
 * @module parseRouteString
 */
var util = require( 'util' );
var _ = require( 'lodash' );
function logFull( obj ) {
	console.log( util.inspect( obj, {
		colors: true,
		depth: null
	}) );
}

// All valid routes in API v2 beta 11
var routes = require( './endpoint-response.json' ).routes;

function getValues( obj ) {
	return Object.keys( obj ).map(function( key ) {
		return obj[ key ];
	});
}

/*

"/wp/v2/posts": {},
"/wp/v2/posts/(?P<id>[\\d]+)": {},
"/wp/v2/posts/(?P<parent>[\\d]+)/revisions": {},
"/wp/v2/posts/(?P<parent>[\\d]+)/revisions/(?P<id>[\\d]+)": {},
"/wp/v2/pages": {},
"/wp/v2/pages/(?P<id>[\\d]+)": {},
"/wp/v2/pages/(?P<parent>[\\d]+)/revisions": {},
"/wp/v2/pages/(?P<parent>[\\d]+)/revisions/(?P<id>[\\d]+)": {},

 */

var buildRouteTree = require( './build-route-tree' );
var routesByNamespace = buildRouteTree( routes );

logFull( routesByNamespace );

/*

I want to deduce the following API from this tree (or one like it):

wp.posts();                     /wp/v2/posts
wp.posts().id( 7 );             /wp/v2/posts/7
wp.posts().id().revisions();    /wp/v2/posts/7/revisions
wp.posts().id().revisions( 8 ); /wp/v2/posts/7/revisions/8

^ That last one's the tricky one: I can deduce that this parameter is "id", but
that param will already be taken by the post ID, so sub-collections have to be
set up as `.revisions()` to get the collection, and `.revisions( id )` to get a
specific resource.

*/


// Flailing around trying to parse all this below

function Handler( namespace, resource ) {
	this._namespace = namespace || '';
	this._base = resource || '';
	// a path component is a "level"-keyed representation of the contents of
	// one section of the requested URL, e.g. `_path: { "0": 17 }` for
	// post ID #17
	this._path = {};
	// A "level" is a level-keyed object representing the valid options for
	// one level of the resource URL
	this._levels = {};
	this._levelValidators = {};
}

Handler.prototype.addLevel = function( level, obj ) {
	this._levels[ level ] = this._levels[ level ] || [];
	this._levels[ level ].push( obj );
};

Handler.prototype.addLevelValidator = function( level, validator ) {
	this._levelValidators[ level ] = this._levelValidators[ level ] || [];
	this._levelValidators[ level ].push( validator );
};

/** WIP */
Handler.prototype.validate = function() {
	// Iterate through all _specified_ levels of this endpoint
	var specifiedLevels = Object.keys( this._path )
		.map(function( level ) {
			return parseInt( level, 10 );
		})
		.sort(function( a, b ) { return a - b; });

	var maxLevel = Math.max.apply( null, specifiedLevels );
	// Ensure that all necessary levels are specified
	for ( var level = 0; level < maxLevel; level++ ) {
		if ( ! this._path[ level ] ) {
			console.error( 'No value specified for level ' + level );
			console.error( '(expected ' + this._levels[ level ].names.join( '/' ) + ')' );
		}
	}
};

// Now that our namespace and levels object has been defined, recurse through
// the node tree representing all possible routes within that namespace to
// define the path value setters and corresponding validators for all possible
// variants of each resource's API endpoints
Object.keys( routesByNamespace ).forEach(function( namespace, idx ) {
	var nsRoutes = routesByNamespace[ namespace ];
	var endpointHandlers = Object.keys( nsRoutes ).reduce(function( handlers, resource ) {
		var handler = new Handler( namespace, resource );
		var levels = nsRoutes[ resource ];

		logFull( levels );

		/**
		 * Walk the tree
		 * @param  {Object} node            A node object
		 * @param  {Object} [node.children] An object of child nodes
		 * // @return {isLeaf} A boolean indicating whether the processed node is a leaf
		 */
		function extractSetterFromNode( node ) {
			var setterFn;

			// For each node, add its handler to the relevant "level" representation
			handler.addLevel( node.level, _.omit( node, 'children' ) );
			handler.addLevelValidator( node.level, node.validate );

			// console.log( node );
			if ( node.children ) {
				getValues( node.children ).map( extractSetterFromNode );
			}
		}

		getValues( levels ).map( extractSetterFromNode );

		handlers[ resource ] = handler;

		logFull( handler );

		return handlers;
	}, {} );

	// logFull( endpointHandlers );
});


// logFull( routesByNamespace );

/*
Object.keys( routes ).forEach(function( route ) {
	// All routes will begin with
	var nsForRoute = routes[ route ].ns;
	// First of all, strip all initial slashes
	route = route.replace( /^\//, '' );
	// Next, remove the namespace, if it is currently prefixed
	route = route.replace( ns, '' );
})
*/