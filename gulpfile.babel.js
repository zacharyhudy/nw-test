'use strict';

import _ from 'lodash';
import autoprefixer from 'autoprefixer';
import config from './.taskconfig';
import del from 'del';
import fs from 'fs';
import gulp from 'gulp';
import merge from 'merge-stream';
import path from 'path';
import sequence from 'run-sequence';
import webpack from 'webpack';
import $cssGlobbing from 'gulp-css-globbing';
import $data from 'gulp-data';
import $jade from 'gulp-jade';
import $postcss from 'gulp-postcss';
import $replace from 'gulp-replace';
import $rev from 'gulp-rev';
import $sass from 'gulp-sass';
import $sitemap from 'gulp-sitemap';
import $size from 'gulp-size';
import $sourcemaps from 'gulp-sourcemaps';
import $util from 'gulp-util';

// Cleans ./public directory.
gulp.task('clean', (callback) => {
  del(config.clean.entry).then((paths) => callback());
});

// Compiles images.
gulp.task('images', () => {
  return gulp.src(config.images.entry)
    .pipe($size({ title: '[images]', gzip: true }))
    .pipe(gulp.dest(config.images.output));
});

// Compiles videos.
gulp.task('videos', () => {
  return gulp.src(config.videos.entry)
    .pipe($size({ title: '[videos]', gzip: true }))
    .pipe(gulp.dest(config.videos.output));
});

// Compiles fonts.
gulp.task('fonts', () => {
  return gulp.src(config.fonts.entry)
    .pipe($size({ title: '[fonts]', gzip: true }))
    .pipe(gulp.dest(config.fonts.output));
});

// Compiles documents.
gulp.task('documents', () => {
  return gulp.src(config.documents.entry)
    .pipe($size({ title: '[documents]', gzip: true }))
    .pipe(gulp.dest(config.documents.output));
});

// Compiles configuration files.
gulp.task('configurations', () => {
  return gulp.src(config.configurations.entry)
    .pipe($size({ title: '[configurations]', gzip: true }))
    .pipe(gulp.dest(config.configurations.output));
});

// Compiles stylesheets.
gulp.task('styles', () => {
  if (config.env.debug) {
    return gulp.src(config.styles.entry)
      .pipe($cssGlobbing(config.styles.cssGlobbing))
      .pipe($sourcemaps.init())
      .pipe($sass(config.styles.sass).on('error', $sass.logError))
      .pipe($postcss([autoprefixer(config.styles.autoprefixer)]))
      .pipe($sourcemaps.write())
      .pipe($size({ title: '[styles]', gzip: true }))
      .pipe(gulp.dest(config.styles.output));
  }
  else {
    return gulp.src(config.styles.entry)
      .pipe($cssGlobbing(config.styles.cssGlobbing))
      .pipe($sass(config.styles.sass).on('error', $sass.logError))
      .pipe($postcss([autoprefixer(config.styles.autoprefixer)]))
      .pipe($size({ title: '[styles]', gzip: true }))
      .pipe(gulp.dest(config.styles.output));
  }
});

// Compiles JavaScript bundle files.
gulp.task('scripts', (callback) => {
  let guard = false;

  let entries = fs.readdirSync(config.scripts.context);
  entries.forEach((file) => {
    if (_.endsWith(file, '.js'))
      config.scripts.entry[file.substr(0, file.length-3)] = `./${file}`;
  });

  if (config.env.watch) {
    if (!config.env.debug) {
      $util.log($util.colors.yellow('Watch is not supported in production.'));
      callback();
    }
    else {
      webpack(config.scripts).watch(100, build(callback));
    }
  }
  else {
    webpack(config.scripts).run(build(callback));
  }

  function build(done) {
    return (err, stats) => {
      if (err)
        throw new $util.PluginError('webpack', err);
      else
        $util.log($util.colors.green('[webpack]'), stats.toString());

      if (!guard && done) {
        guard = true;
        done();
      }
    };
  }
});

// Compiles templates.
gulp.task('templates', () => {
  // Fetch updated data from global config file.
  delete require.cache[require.resolve(config.paths.config)];
  let globalConfig = require(config.paths.config);

  let locales = globalConfig.locales;
  let ltxts = {};
  let streams = [];

  if (locales instanceof Array) {
    locales.forEach((val) => {
      let p = path.join(path.join(config.paths.config, 'locales', val));

      try {
        delete require.cache[require.resolve(p)];
        ltxts[val] = require(p);
      }
      catch (e) {
        throw new Error(`No source file found for locale: ${val}. If this locale is not supported please remove it from app config file.`);
      }
    });
  }

  for (let locale in ltxts) {
    let isDefaultLocale = (locale === locales[0]);

    streams.push(
      gulp.src(config.templates.input)
        .pipe($data((file) => {
          let webRoot = globalConfig.webRoot ? globalConfig.webRoot : '';
          let locals = {
            config: globalConfig,
            locale: locale,
            webRoot: webRoot,
            // Expose a method for looking up localized strings.
            t: (s) => {
              if (typeof s !== 'string') throw new Error(`Bad argument passed to t(): ${s}`);
              return _.get(ltxts[locale], s, s);
            },
            // Expose a method for prefixing permalinks with the correct locale.
            r: (s) => {
              // Permalinks in the default locale do not require any locale
              // prefixes, so return the string untouched.
              if (isDefaultLocale) {
                return s;
              }
              // Prefix the permalink with the correct locale ID. Account for
              // cases where the permalink is already prefixed with the locale.
              else {
                let parts = _.compact(s.split('/'));
                if (locales.indexOf(parts[0]) < 0) parts.unshift(locale);
                return '/' + parts.join('/');
              }
            }
          };

          return locals;
        }))
        .pipe($jade(config.templates.jade))
        .pipe(gulp.dest((isDefaultLocale) ? config.templates.output : path.join(config.templates.output, locale)))
    );
  }

  return (streams.length > 0) ?
    merge.apply(null, streams) :
    gulp.src(config.templates.input)
      .pipe($data((file) => {
        return {
          config: globalConfig,
          t: (s) => (s),
          r: (s) => (s)
        };
      }))
      .pipe($jade(config.templates.jade))
      .pipe(gulp.dest(config.templates.output));
});

// Adds revision hashes to all assets and replaces corresponding paths.
gulp.task('rev', (callback) => {
  if (config.env.debug) {
    callback();
    return;
  }

  gulp.src(config.rev.entry)
    .pipe($rev())
    .pipe(gulp.dest(config.rev.output))
    .pipe($rev.manifest(config.rev.manifestFile))
    .pipe(gulp.dest(config.rev.output))
    .on('end', () => {
      let manifestFile = path.join(config.rev.output, config.rev.manifestFile);
      let manifest = require(manifestFile);
      let removables = [];
      let pattern = '';

      for (let v in manifest) {
        pattern += (pattern === '') ? '' : '|';
        pattern += v;

        if (v !== manifest[v])
          removables.push(path.join(config.rev.output, v));
      }

      removables.push(manifestFile);

      del(removables).then((paths) => {
        let regex = new RegExp(pattern, 'gi');

        gulp.src(config.rev.replace)
          .pipe($replace(regex, (m) => (manifest[m])))
          .pipe(gulp.dest(config.rev.output))
          .on('end', callback)
          .on('error', callback);
      });
    })
    .on('error', callback);
});

// Generates a sitemap from all the compiled template files.
gulp.task('sitemap', () => {
  let globalConfig = require(config.paths.config);

  gulp.src(config.sitemap.entry)
    .pipe($sitemap({
      siteUrl: globalConfig.url
    }))
    .pipe(gulp.dest(config.sitemap.output));
});

// Deploys the app to the FTP server specified in config.
gulp.task('deploy', () => {
  let ftp = require('vinyl-ftp');
  let ftpConfig = JSON.parse(fs.readFileSync(path.join(config.paths.base, '.ftprc')), 'utf8');

  if (config.env.debug)
    ftpConfig = ftpConfig.development;
  else
    ftpConfig = ftpConfig.production;

  ftpConfig.log = $util.log;

  let conn = ftp.create(ftpConfig);

  return gulp.src(config.deploy.entry, { buffer: false })
    .pipe(conn.newer(ftpConfig.remotePath))
    .pipe(conn.dest(ftpConfig.remotePath));
});

// Serves the app locally using BrowserSync server for live reloading. Watch
// option is only supported in debug mode.
gulp.task('serve', (callback) => {
  if (config.env.watch && !config.env.debug) {
    $util.log($util.colors.yellow('Watch is not supported in production'));
    callback();
  } else {
    let browserSync = require('browser-sync');
    browserSync(config.serve);

    // Watch for changes.
    if (config.env.watch) {
      let entries = config.watch;

      for (let i = 0; i < entries.length; i++) {
        let entry = entries[i];
        gulp.watch(entry.files, entry.tasks);
      }
    }
  }
});

// Default Gulp task, compiles all assets.
gulp.task('default', (done) => {
  let seq = ['clean', 'images', 'videos', 'fonts', 'documents', 'configurations', 'styles', 'scripts', 'templates'];
  if (!config.env.debug) seq.push('rev');
  if (!config.env.debug) seq.push('sitemap');
  if (config.env.serve) seq.push('serve');
  seq.push(done);
  sequence.apply(null, seq);
});
