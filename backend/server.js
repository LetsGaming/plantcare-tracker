const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const plantRoutes = require('./routes/plantRoutes');
const substrateRoutes = require('./routes/substrateRoutes');
const imageRoutes = require('./routes/imageRoutes');
const loadEnv = require('./utils/envUtils.js');

loadEnv();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/substrates', substrateRoutes);
app.use('/api/images', imageRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
