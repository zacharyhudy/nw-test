/* globals createjs */

'use strict';

import page from 'page';
import request from 'superagent';
import _ from 'lodash';
import { autoRouting, locales } from '../../../../config';

/**
 * Singleton class for managing page routing and traisitions. Routing is based
 * on PageJS - see {@link https://visionmedia.github.io/page.js/}.
 * @class
 */
class PageManager {
  /**
   * The shared singleton PageManager instance.
   * @type {PageManager}
   */
  static get sharedInstance() {
    if (PageManager.__private__ === undefined) PageManager.__private__ = {};
    if (PageManager.__private__.sharedInstance === undefined) PageManager.__private__.sharedInstance = new PageManager();
    return PageManager.__private__.sharedInstance;
  }

  /**
   * ID of the target element where non-root pages will be loaded into.
   * @type {string}
   */
  static get targetElementID() { return (PageManager.__private__ && PageManager.__private__.targetElementID) || 'page'; }
  static set targetElementID(val) {
    if (typeof val !== 'string') throw new Error(`Target element ID must be a string`);
    if (PageManager.__private__ === undefined) PageManager.__private__ = {};
    PageManager.__private__.targetElementID = val;
  }

  /**
   * @see PageManager#previousPage
   */
  static get previousPage() { return PageManager.sharedInstance.previousPage; }

  /**
   * @see PageManager#currentPage
   */
  static get currentPage() { return PageManager.sharedInstance.currentPage; }

  /**
   * @see PageManager#previousLocale
   */
  static get previousLocale() { return PageManager.sharedInstance.previousLocale; }

  /**
   * @see PageManager#currentLocale
   */
  static get currentLocale() { return PageManager.sharedInstance.currentLocale; }

  /**
   * @see PageManager#defineRoute
   */
  static route() { PageManager.sharedInstance.defineRoute.apply(PageManager.sharedInstance, arguments); }

  /**
   * @see PageManager#defineTransition
   */
  static transition() {
    let args = Array.prototype.slice.call(arguments, 0);
    PageManager.sharedInstance.defineTransition.apply(PageManager.sharedInstance, args);
  }

  /**
   * @see PageManager#defineLoad
   */
  static on() {
    let args = Array.prototype.slice.call(arguments, 0);
    PageManager.sharedInstance.defineLoad.apply(PageManager.sharedInstance, args);
  }

  /**
   * Normalizes a path (i.e. remove locale prefixes).
   * @param {string} path
   * @return {string}
   */
  static normalizePath(path) {
    let l = locales.slice(1);
    let p = _.compact(path.split('/'));
    if (l.indexOf(p[0]) >= 0) p.shift();
    return `/${p.join('/')}`;
  }

  /**
   * Checks to see if a target path is a subset of a wildcard path ending with *.
   * @param {string}  wildcardPath
   * @param {string}  targetPath
   */
  static isSubsetOfWildcardPath(wildcardPath, targetPath) {
    if (!_.startsWith(wildcardPath, '/')) wildcardPath = '/' + wildcardPath;
    if (wildcardPath.length > 1 && _.endsWith(wildcardPath, '/')) wildcardPath = wildcardPath.substr(0, wildcardPath.length-1);
    if (!_.startsWith(targetPath, '/')) targetPath = '/' + targetPath;
    if (targetPath.length > 1 && _.endsWith(targetPath, '/')) targetPath = targetPath.substr(0, targetPath.length-1);

    if (!_.endsWith(wildcardPath, '*')) return false;

    let t = wildcardPath.substr(0, wildcardPath.length-1);

    return (targetPath.indexOf(t) === 0);
  }

  /**
   * @see PageManager#startRouting()
   */
  static startRouting() { PageManager.sharedInstance.startRouting(); }

  /**
   * @see PageManager#stopRouting()
   */
  static stopRouting() { PageManager.sharedInstance.stopRouting(); }

  /**
   * Path history (a LIFO stack).
   * @type {Array}
   */
  get history() {
    if (this.__private__ === undefined) this.__private__ = {};
    if (this.__private__.history === undefined) this.__private__.history = [];
    return this.__private__.history;
  }

  /**
   * Previous page.
   * @type {string}
   */
  get previousPage() {
    let l = this.history.length;
    let p = (l > 1) ? this.history[l-2] : null;

    if (p) {
      if (!_.startsWith(p, '/')) p = '/' + p;
      if (p.length > 1 && _.endsWith(p, '/')) p = p.substr(0, p.length-1);
    }

    return p;
  }

  /**
   * Current page.
   * @type {string}
   */
  get currentPage() {
    let l = this.history.length;
    let p = (l > 0) ? this.history[l-1] : window.location.pathname;

    if (p) {
      if (!_.startsWith(p, '/')) p = '/' + p;
      if (p.length > 1 && _.endsWith(p, '/')) p = p.substr(0, p.length-1);
    }

    return p;
  }

  /**
   * Previous locale.
   * @type {string}
   */
  get previousLocale() {
    if (this.previousPage) {
      let l = locales.slice(1);
      let p = _.compact(this.previousPage.split('/')).shift();

      if (l.indexOf(p) < 0)
        return null;
      else
        return p;
    }

    return null;
  }

  /**
   * Current locale.
   * @type {string}
   */
  get currentLocale() {
    if (this.currentPage) {
      let l = locales.slice(1);
      let p = _.compact(this.currentPage.split('/')).shift();

      if (l.indexOf(p) < 0)
        return null;
      else
        return p;
    }

    return null;
  }

  /**
   * Look-up dictionary for in and out transitions.
   * @type {Object}
   */
  get transitions() {
    if (this.__private__ === undefined) this.__private__ = {};
    if (this.__private__.transitions === undefined) this.__private__.transitions = { in: {}, out: {} };
    return this.__private__.transitions;
  }

  /**
   * Look-up dictionary for page load handlers.
   * @type {Object}
   */
  get initializers() {
    if (this.__private__ === undefined) this.__private__ = {};
    if (this.__private__.initializers === undefined) this.__private__.initializers = { beforeLoad: {}, loading: {}, afterLoad: {} };
    return this.__private__.initializers;
  }

  /**
   * Creates a new PageManager instance.
   */
  constructor() {
    if (!PageManager.__private__) throw new Error('PageManager is meant to be a singleton class and should not be instantiated via new. Fetch the single instance using PageManager.sharedInstance.');

    if (autoRouting) {
      // Track page history.
      page('/*', (ctx, next) => {
        this.history.push(ctx.path);
        next();
      });

      // Initiate transition out.
      page('/*', (ctx, next) => {
        if (ctx.init) {
          next();
        }
        // No transition out if switching locales.
        else if (PageManager.previousLocale !== PageManager.currentLocale) {
          next();
        }
        else {
          let transition = this.lookUp(this.transitions.out, this.previousPage);

          if (transition && (transition.to === this.currentPage || PageManager.isSubsetOfWildcardPath(transition.to, this.currentPage)))
            transition.handler(next);
          else
            next();
        }
      });

      // Load new page.
      page('/*', (ctx, next) => {
        if (ctx.init) {
          next();
        }
        else {
          request
            .get(ctx.canonicalPath)
            .end((err, res) => {
              if (!err && res.text) {
                let regex = /<body[^>]*>((.|[\n\r])*)<\/body>/im;
                let tregex = /<title[^>]*>(.*)<\/title>/im;
                let rawBody = regex.exec(res.text);
                let title = tregex.exec(res.text)[1];

                if (!rawBody) throw new Error(`Cannot find body element in fetched HTML`);
                rawBody = rawBody[0];

                document.title = title;

                // Locale change gets special treatment. The entire <body> will
                // be replaced by the fetched HTML.
                if (PageManager.previousLocale !== PageManager.currentLocale) {
                  document.body.innerHTML = rawBody;
                }
                else {
                  let element = document.createElement('div');
                  let core = document.querySelector(`#${PageManager.targetElementID}`);
                  element.innerHTML = rawBody;
                  element = element.querySelector(`#${PageManager.targetElementID}`);
                  core.innerHTML = element.innerHTML;
                }

                next();
              }
            });
        }
      });

      // Initiate transition in.
      page('/*', (ctx, next) => {
        if (ctx.init) {
          next();
        }
        else {
          let transition = this.lookUp(this.transitions.in, this.currentPage);

          if (transition && (transition.from === this.previousPage || PageManager.isSubsetOfWildcardPath(transition.from, this.previousPage)))
            transition.handler(next);
          else
            next();
        }
      });

      page('/*', (ctx, next) => {
        this.initPage();
      });
    }
    else {
      ready(this.initPage.bind(this));
    }
  }

  /**
   * Defines a route using the PageJS API.
   * @see {@link https://visionmedia.github.io/page.js/}
   */
  defineRoute() {
    page.apply(page, arguments);
  }

  /**
   * Defines a transition (in/out).
   * @param {string}          - The direction of the transition, either 'in' or
   *                            'out'.
   * @param {string|Function} - The meaning of this value depends on the number
   *                            of arguments passed into this method.
   *                            2: This will be the handler for all transitions
   *                               of the specified direction.
   *                            3: This will be the from path if the direction
   *                               is 'out' or the to path if the direction is
   *                               'in'.
   *                            4: This will be the from path.
   * @param {string|Function} - The meaning of this value depends on the number
   *                            of arguments passed into this method.
   *                            3: This will be the handler for all transitions
   *                               of the specified direction.
   *                            4: This will be the to path.
   * @param {function}        - The handler for transitions defined in this
   *                            direction for the specific from/to path combos.
   */
  defineTransition() {
    let arg1 = arguments[0];
    let arg2 = arguments[1];
    let arg3 = arguments[2];
    let arg4 = arguments[3];
    let fromPath = '/*';
    let toPath = '/*';
    let handler = null;

    // Sanity checks.
    if (arg1 !== 'in' && arg1 !== 'out') throw new Error(`First argument to defineTransition() must be either 'in' or 'out'`);

    switch (arguments.length) {
      case 2:
        if (typeof arg2 !== 'function') throw new Error(`Second argument to defineTransition() must be a function`);
        handler = arg2;
        break;
      case 3:
        if (typeof arg2 === 'string' && typeof arg3 === 'string') {
          fromPath = arg2;
          toPath = arg3;
        }
        else if (typeof arg2=== 'string' && typeof arg3 === 'function') {
          if (arg1 === 'in')
            toPath = arg2;
          else
            fromPath = arg2;

          handler = arg3;
        }
        else {
          throw new Error(`Expecting second argument to be a path and third argument to be either a path/function`);
        }
        break;
      case 4:
        if (typeof arg2 !== 'string') throw new Error(`Second argument to defineTransition() must be a path`);
        if (typeof arg3 !== 'string') throw new Error(`Third argument to defineTransition() must be a path`);
        if (typeof arg4 !== 'function') throw new Error(`Forth argument to defineTransition() must be a function`);
        fromPath = arg2;
        toPath = arg3;
        handler = arg4;
        break;
      default:
        throw new Error(`Invalid arguments passed to transitionOut(), expecting at least 2 and maximum 4 arguments`);
    }

    if (arg1 === 'in') {
      this.transitions.in[toPath] = {
        from: fromPath,
        handler: handler
      };
    }
    else {
      this.transitions.out[fromPath] = {
        to: toPath,
        handler: handler
      };
    }
  }

  /**
   * Defines handler that triggers before a page is fully loaded.
   * @param {string|Function} - The meaning of this value depends on the number
   *                            of arguments passed into this method.
   *                            1. Handler invoked after every page load.
   *                            2. The path or load state this handler is
   *                               defined for. Load states are one of
   *                               'beforeLoad', 'loading', or 'afterLoad'.
   *                            3. The load state of the page of which the
   *                               handler should be invoked: 'beforeLoad',
   *                               'loading', or 'afterLoad'.
   * @param {string|Function} - The meaning of this value depends on the number
   *                            of arguments passed into this method.
   *                            2. Handler invoked at the specified state or
   *                               path of the page load.
   *                            3. The path this handler is defined for.
   * @param {Function}        - Handler invoked at the specified state and path
   *                            of the page load.
   */
  defineLoad() {
    let arg1 = arguments[0];
    let arg2 = arguments[1];
    let arg3 = arguments[2];
    let state = 'afterLoad';
    let path = '/*';
    let handler = null;

    switch (arguments.length) {
      case 1:
        if (typeof arg1 !== 'function') throw new Error(`defineLoad() expects argument to be a function when only 1 argument is passed`);
        handler = arg1;
        break;
      case 2:
        if (typeof arg1 !== 'string' || typeof arg2 !== 'function') throw new Error(`defineLoad() expects first argument to be a load state/path and second argument to be a function`);
        if (arg1 === 'beforeLoad' || arg1 === 'loading' || arg1 !== 'afterLoad')
          state = arg1;
        else
          path = arg1;
        handler = arg2;
        break;
      case 3:
        if (typeof arg1 !== 'string' || typeof arg2 !== 'string' || typeof arg3 !== 'function') throw new Error(`defineLoad() expects first argument to be a load state, second argument to be a path, and third argument to be a function`);
        if (arg1 !== 'beforeLoad' && arg1 !== 'loading' && arg1 !== 'afterLoad') throw new Error(`Bad load state specified`);
        state = arg1;
        path = arg2;
        handler = arg3;
        break;
      default:
        throw new Error(`Invalid arguments passed into defineBeforeLoad()`);
    }

    this.initializers[state][path] = handler;
  }

  /**
   * Starts the router.
   */
  startRouting() {
    ready(page.start);
  }

  /**
   * Stops the router.
   */
  stopRouting() {
    page.stop();
  }

  /**
   * Intializes a new page.
   */
  initPage() {
    let beforeLoad = this.lookUp(this.initializers.beforeLoad, this.currentPage);

    if (beforeLoad) {
      beforeLoad(this.loadPageAssets.bind(this));
    }
    else {
      this.loadPageAssets();
    }
  }

  /**
   * Loads all assets in the new page.
   */
  loadPageAssets() {
    let duringLoad = this.lookUp(this.initializers.loading, this.currentPage);
    let afterLoad = this.lookUp(this.initializers.afterLoad, this.currentPage);
    let assetManifest = [];
    let images = document.querySelectorAll('img,figure');

    for (let i = 0; i < images.length; i++) {
      let img = images[i];
      let src = null;

      if (img.src && img.src !== '') {
        src = img.src;
      }
      else {
        let url = /^url\((['"]?)(.*)\1\)$/.exec(window.getComputedStyle(img).getPropertyValue('background-image'));
        if (url) {
          src = url[2];
        }
      }

      if (src) assetManifest.push({ id: i, src: src });
    }

    let queue = new createjs.LoadQueue();
    if (duringLoad) queue.on('progress', (event) => duringLoad(event.loaded, event.total));
    if (afterLoad) queue.on('complete', () => afterLoad(_.noop));
    queue.loadManifest(assetManifest);
  }

  /**
   * Looks up a path-keyed dictionary and returns its value.
   * @param {Object} dict
   * @param {string} path
   * @return {*}
   */
  lookUp(dict, path) {
    if (path !== '/*') {
      if (!_.startsWith(path, '/')) path = '/' + path;
      if (path.length > 1 && _.endsWith(path, '/')) path = path.substr(0, path.length-1);
    }

    if (dict[path]) {
      return dict[path];
    }
    else if (dict[PageManager.normalizePath(path)]) {
      return dict[PageManager.normalizePath(path)];
    }
    else {
      let s = null;
      let k = null;

      for (let key in dict) {
        if (PageManager.isSubsetOfWildcardPath(key, path)) {
          let t = _.compact(key.split('/'));

          if (!s || s.length < t.length) {
            s = t;
            k = key;
          }
        }
      }

      return (k) ? dict[k] : null;
    }
  }
}

/**
 * Helper function for invoking a callback when the DOM is ready.
 * @param {Function} callback
 * @private
 */
function ready(callback) {
  let onLoaded = (event) => {
    if (document.addEventListener) {
      document.removeEventListener('DOMContentLoaded', onLoaded, false);
      window.removeEventListener('load', onLoaded, false);
    }
    else if (document.attachEvent) {
      document.detachEvent('onreadystatechange', onLoaded);
      window.detachEvent('onload', onLoaded);
    }

    setTimeout(callback, 1);
  };

  if (document.readyState === 'complete') {
    return setTimeout(callback, 1);
  }

  if (document.addEventListener) {
    document.addEventListener('DOMContentLoaded', onLoaded, false);
    window.addEventListener('load', onLoaded, false);
  }
  else if (document.attachEvent) {
    document.attachEvent('onreadystatechange', onLoaded);
    window.attachEvent('onload', onLoaded);
  }
}

export default PageManager;
