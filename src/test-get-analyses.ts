import { listAllAnalysesAdmin } from './repositories/analysis.repository.js';

async function main() {
    const result = await listAllAnalysesAdmin();
    console.log("Found:", result.length);
    if (result.length > 0) {
        console.log(result[0]);
    }
}

main().catch(console.error);
