/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = Storage;

if (!global.R5) {
  global.R5 = {
    out: new (require('./Output.js'))('storage')
  };
}

let fs = require('fs');
let path = require('path');
let storage = require('@google-cloud/storage');
let config = {
  project_id: process.env.GCLOUD_PROJECT,
  live: process.env.NODE_ENV === 'production'
}

// Constructor

function Storage (bucket = process.env['GCLOUD_STORAGE_BUCKET']) {
  this.storage = storage({
    projectId: config.project_id
  });

  this.bucket = this.storage.bucket(bucket);
  this.root_dir = config.live ? 'production' : 'development';
}

// Public Methods

Storage.prototype = {
  LOCAL_DIR: '/tmp',

  create_file: function (params = {}, callback) {
    if (!params['content'] || !params['name']) {
      return callback();
    }

    let remote_path = `${params['directory'] ? `${params['directory']}/` : ''}${params['name']}`;
    let local_path = `${this.LOCAL_DIR}/${params['name']}`;
    let _this = this;

    fs.writeFile(local_path, params['content'], function (err) {
      if (err) {
        R5.out.error(`create_file: (${local_path}) ${err}`);
        return callback();
      }

      if (params['upload']) {
        if (fs.existsSync(local_path)) {
          fs.chmodSync(local_path, '0777');
          _this.upload_file(local_path, remote_path, callback);
          return;
        }
        else {
          R5.out.error(`create_file failed: (${local_path})`);
        }
      }

      return callback();
    });
  },

  get_file: function (params = {}, callback) {
    if (!params['name']) {
      return callback();
    }

    let remote_path = `${params['directory'] ? `${params['directory']}/` : ''}${params['name']}`;
    let local_path = `${this.LOCAL_DIR}/${params['name']}`;

    if (fs.existsSync(local_path)) {
      R5.out.log(`get_file: ${params['name']} already downloaded`);
      get_file_content(local_path, callback);
      return;
    }

    if (params['remote']) {
      this.download_file(local_path, remote_path, callback);
      return;
    }

    return callback();
  },

  upload_file: function (local_path, remote_path, callback) {
    if (!fs.existsSync(local_path)) {
      R5.out.error(`upload_file: ${local_path} does not exist`);
      return callback();
    }

    let options = {
      destination: `${this.root_dir}/${remote_path}`
    };

    this.bucket.upload(local_path, options, function (err, file) {
      if (err) {
        R5.out.error(`upload_file: ${local_path}, could not upload: ${err}`);
      }
      return callback();
    });
  },

  download_file: function (local_path, remote_path, callback) {
    if (fs.existsSync(local_path)) {
      R5.out.log(`download_file: ${local_path} already downloaded`);
      get_file_content(local_path, callback);
      return;
    }

    let file = this.bucket.file(`${this.root_dir}/${remote_path}`);
    if (!file) {
      R5.out.error(`download_file: ${remote_path} does not exist`);
      return callback();
    }

    let options = {
      destination: local_path
    };

    let _this = this;
    file.download(options, function (err, data) {
      if (err) {
        R5.out.error(`download_file: ${remote_path} could not download: ${err}`);
      }
      _this.create_file({
        content: data,
        name: path.basename(local_path),
        directory: path.dirname(local_path)
      }, function () {
        return callback(data);
      });
    });
  },

  delete_file: function (params = {}) {
    if (!params['name']) { return; }

    let local_path = `${this.LOCAL_DIR}/${params['name']}`;

    if (fs.existsSync(local_path)) {
      fs.unlink(local_path, function () { });
    }
  },
  
  change_local_dir: function (dir_path) {
    this.LOCAL_DIR = dir_path;
  }
};

// Private Methods

function get_file_content (path, callback) {
  fs.readFile(path, function (err, data) {
    if (err) {
      R5.out.error(`get_file_content: ${path} cannot read`);
    }
    return callback(data);
  });
}
