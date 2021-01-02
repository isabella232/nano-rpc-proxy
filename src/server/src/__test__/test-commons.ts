import fs from "fs";

const testFolder = 'src/__test__/';

export function copyConfigFiles(filePaths: string[]) {
    filePaths.forEach(filePath => {
        fs.copyFileSync(`${filePath}.default`, `${testFolder}${filePath}`, )
    })
}
export function deleteConfigFiles(filePaths: string[]) {
    filePaths.forEach(filePath => {
        try {
            let path = `${testFolder}${filePath}`;
            console.log(path)
            fs.unlinkSync(path)
        } catch (e) {
            console.log(e)
            // file might not be found which is OK
        }
    })
}
