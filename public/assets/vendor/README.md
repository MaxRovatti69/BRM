# Browser dependencies

React and ReactDOM 18.3.1, production UMD distributions from their official npm
package tarballs, served locally. These files require no Node.js/npm installation
on either the development computer or the PHP hosting server.

Tarball integrity was verified against each package's SHA-512 `dist.integrity`
metadata from registry.npmjs.org before extraction. See `integrity.json` for the
recorded metadata and file checksums. Keep the MIT license files with the assets.

An update must use official releases, verify their published integrity, preserve
licenses, and rerun the PHP and Chromium tests. There is no automatic remote loading.
