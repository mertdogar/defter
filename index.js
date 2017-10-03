#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const homedir = require('homedir');
const kpio = require('keepass.io/lib');
const ask = require('prompt-autocomplete');
const _ = require('lodash');
const colors = require('colors');
const argv = require('minimist')(process.argv.slice(2));
const configPath = path.join(homedir(), '.defterrc.json');
const clipboard = require('copy-paste');


function readConfig() {
    return new Promise((resolve, reject) => {
        fs.readFile(configPath, 'utf8', (err, data) => {
            let rv;
            if (err)
                return reject(err);

            try {
                rv = JSON.parse(data);
            } catch(err) {
                console.log(`Could not load configuration file`, err);
            }

            if (!rv.password) return reject('password not found, reset your config');
            if (!rv.keyfilePath) return reject('key not found, reset your config');
            if (!rv.databasePath) return reject('db not found, reset your config');

            resolve(rv);
        });
    });
}


function writeConfig(config) {
    return new Promise((resolve, reject) => {
        fs.writeFile(configPath, JSON.stringify(config, null, 4), 'utf8',  err => {
            if (err)
                return reject(err);

            resolve();
        });
    });
}


function extract(entryData, key, opt_subKey) {
    const item = _.find(entryData, {Key: key});
    return {
        label: key,
        value: opt_subKey ? item.Value[opt_subKey] : item.Value
    };
}


function print(data) {
    const items = Object.keys(data);
    _.forEach(data, item => {
        if (!item.value) return;

        console.log(`${item.label.bold.underline}: `);
        console.log(`${item.value.gray}`);
    });
}


function setConfig() {
    console.log('Setting configuration');
    return new Promise((resolve, reject) => {
        if (!argv.db) return reject('db missing');
        if (!argv.password) return reject('password missing');
        if (!argv.key) return reject('key missing');

        const config = {
            password: argv.password,
            keyfilePath: argv.key,
            databasePath: argv.db
        };

        writeConfig(config)
            .then(_ => resolve())
            .catch(err => reject(err));
    })
    .catch(err => {
        console.log('Error: Could not set config.'.red);
        console.log('Cause:'.underline.white + ' ' + (err.message || err));
    });
}


function showHeader() {
    console.log('defter'.rainbow + ': '.white + 'keepass manager'.gray);
}


function showHelp() {
    showHeader();
    showVersion();
    console.log('');
    console.log('set database and credentials: '.white);
    console.log('defter --init --db /db/path --key /key/path --password pass'.gray);
    console.log('');
    console.log('open/browse database: '.white);
    console.log('defter'.gray);
    console.log(' type to search or/and use arrow keys to select'.gray);
    console.log(' hit enter to print selected item'.gray);
}


function showVersion() {
    console.log('version: '.white + require('./package.json').version.gray);
}


if (argv.v || argv.version)
    return showVersion();


if (argv.h || argv.help)
    return showHelp();


if (argv.init)
    return setConfig();


readConfig()
    .then(config => {
        const db = new kpio.Database();
        db.addCredential(new kpio.Credentials.Password(config.password));
        db.addCredential(new kpio.Credentials.Keyfile(config.keyfilePath));
        db.loadFile(config.databasePath, function(err) {
            if (err) throw err;

            const rawDatabase = db.getRawApi().get();
            let entries = _.map(rawDatabase.KeePassFile.Root.Group.Entry, entry => {
                const entryData = entry.String;
                return {
                    key: extract(entryData, 'Title'),
                    password: extract(entryData, 'Password', '_'),
                    notes: extract(entryData, 'Notes'),
                    url: extract(entryData, 'URL'),
                    username: extract(entryData, 'UserName')
                }
            });

            const entryKeys = _.map(entries, entry => entry.key.value);
            ask('Search:', entryKeys, (err, answer) => {
                const match = _.find(entries, entry => entry.key.value == answer);
                print(match);

                if (match && match.password && match.password.value) {
                    clipboard.copy(match.password.value);
                }
            });

            if (argv._.length > 0) {
                process.stdin.emit('data', argv._.join(' '));
            }
        });
    })
    .catch(err => {
        console.log('Error: Could not read config file. Config is missing or corrupted.'.red);
        console.log('Cause:'.underline.white + ' ' + (err.message || err));
    });

