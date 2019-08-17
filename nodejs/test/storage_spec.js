/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */
require('dotenv').config();
require(`./test_modules.js`);
var fs = require('fs');
var storage = new (require('../lib/Storage.js'))();
var local_dir = './test/tmp';

describe('storage', () => {
  it('should not consist undefined value', (done) => {
    expect(storage).to.not.equal(undefined);
    done();
  });
});

describe('create_file', () => {
  it('should create file and return no object', (done) => {
    let params = {};
    params['content'] = 'test string';
    params['name'] = 'sample.txt';
    if (!fs.existsSync(local_dir)) {
      fs.mkdirSync(local_dir);
    }
    storage.change_local_dir(local_dir);
    storage.create_file(params, function () {
      let local_path = `${local_dir}/${params['name']}`;
      fs.access(local_path, fs.constants.F_OK, (err) => {
        done();
      });
    });
  });
});

describe('get_file', () => {
  it('should get file and check if file exits', (done) => {
    let params = {};
    params['name'] = 'sample.txt';
    storage.get_file(params, function () {
      let local_path = `${local_dir}/${params['name']}`;
      let exist_file = fs.existsSync(local_path);
      expect(exist_file).to.equal(true);
      done();
    });
  });
});

describe('delete_file', () => {
  it('should delete file and check if file exits', (done) => {
    let params = {};
    params['name'] = 'sample.txt';
    var local_path = `${local_dir}/${params['name']}`;
    storage.delete_file(params);
    setTimeout(function () {
      var exists = fs.existsSync(local_path);
      expect(exists).to.not.equal(true);
      done();
    }, 1500);
  });
});
