import installPackage, {addPackageToConfig, canInstallPackage} from './installPackage';
import {editConfig} from './util';

/**
 * 'install *'
 * @param {string[]} argv
 * @returns {undefined}
 */
export default function (argv) {
    if (!argv.length) {
        console.log(`Running 'install'`);
        return void emptyInstall();

    } else if (argv.length === 1) {
        console.log(`Trying to install package '${argv[0]}'`);
        canInstallPackage(argv[0])
            .then (async packageExists => {
                if (!packageExists) {
                    console.log(`Looks like the particle '${argv[0]}' doesn't exist`);
                    return;
                }
                if (await installPackage(argv[0]))
                    addPackageToConfig(argv[0]);
            });

    } else {
        console.log(`Invalid number of arguments. Expected 0 or 1 on command 'install'`);
    }
}

/**
 * @param {string[]} deps
 * @returns {Promise<boolean>} success
 */
export function installListOfDeps (deps) {
    return new Promise(resolve => {
        let numPackages = deps.length;

        let installed = 0;
        for (let particle of deps) {
            if (typeof particle !== 'string') {
                console.error(`Invalid particle name '${particle}'. Must be of type string.`);
                numPackages--;
                continue;
            }

            (async () => {
                // run each install async-ly and separately

                if (!(await canInstallPackage(particle))) {
                    console.error(`Can't install particle '${particle}'.`);
                    numPackages--;
                    return;
                }

                await installPackage(particle);

                installed++;

                if (installed >= numPackages) {
                    console.log('Finished installing particles');
                    resolve();
                }
            })();
        }

    })

}

/**
 * Runs 'espm install'
 * - return in no config file found
 * - make sure particle folder exists
 * - for each particle in the config file
 *  - skip if it has been downloaded
 *  - download content of particle
 *  - add package content to particle folder
 *  @returns {Promise<void>}
 */
function emptyInstall () {
    return new Promise((resolve) => {
        editConfig(async config => {

            let packages = config['bonds'];

            if (!Array.isArray(packages)) {
                config['bonds'] = [];
                packages = [];
            }

            const idx = packages.indexOf(config.name);
            if (idx !== -1) {
                packages.splice(idx, 1);
            }

            await installListOfDeps(packages);

            resolve();
            return config;
        });
    });
}