const bcrypt = require('bcryptjs');

async function hashPassword() {
    const password = 'Sita@1968@manu';
    const hash = await bcrypt.hash(password, 10);
    console.log('Password hash:', hash);
}

hashPassword().catch(console.error);
