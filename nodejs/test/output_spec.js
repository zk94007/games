/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */
require(`./test_modules.js`);
let log_folder = `${__dirname}/../logs`;
let fs = require('fs');
if (!fs.existsSync(log_folder)) {
  fs.mkdirSync(log_folder);
}
var output = new (require('../lib/Output.js'))('test');

describe('output', () => {
  it('should display proper file name', (done) => {
    let file_name = output.file_name.split('/');
    expect(file_name[file_name.length - 1]).to.equal('test.log');
    done();
  });

  it('should print logs in log file', (done) => {
    let str = 'test string';
    let data_string = '';
    output.log(str);
    data_string = fs.readFileSync(output.file_name, 'utf8');
    fs.unlinkSync(output.file_name);
    fs.rmdirSync(log_folder);
    expect(data_string.includes(str)).to.equal(true);
    done();
  });
});
