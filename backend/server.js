const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes.js');
const plantRoutes = require('./src/routes/plantRoutes.js');
const substrateRoutes = require('./src/routes/substrateRoutes.js');
const imageRoutes = require('./src/routes/imageRoutes.js');
const errorHandler = require('./src/middlewares/errorHandler.js')
const logger = require('./src/utils/logger.js')

const loadEnv = require('./src/utils/envUtils.js');
loadEnv();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(bodyParser.json());

app.use(errorHandler);

app.use('/api/auth', authRoutes);
app.use('/api/plants', plantRoutes);
app.use('/api/substrates', substrateRoutes);
app.use('/api/images', imageRoutes);


app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
