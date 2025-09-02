const express = require('express');
const https = require('https');
const querystring = require('querystring');
const ExcelJS = require('exceljs');
const LarkConfig = require('../models/LarkConfig');
const { refreshTokenIfNeeded, forceRefreshTokens } = require('../services/larkTokenService');

const router = express.Router();

class LarkSuiteClient {
constructor(tenantAccessToken, userAccessToken) {
this.tenantAccessToken = tenantAccessToken;
this.userAccessToken = userAccessToken;
this.baseUrl = 'open.larksuite.com';
}

async getRecords(appToken, tableId, options = {}) {
const {
viewId,
filter,
sort,
fieldNames,
textFieldAsArray = false,
userIdType = 'open_id',
displayFormulaRef = false,
automaticFields = false,
pageToken,
pageSize = 1
} = options;

const queryParams = {};

if (viewId) queryParams.view_id = viewId;
if (filter) queryParams.filter = filter;
if (sort) queryParams.sort = JSON.stringify(sort);
if (fieldNames) queryParams.field_names = JSON.stringify(fieldNames);
if (textFieldAsArray) queryParams.text_field_as_array = textFieldAsArray;
if (userIdType) queryParams.user_id_type = userIdType;
if (displayFormulaRef) queryParams.display_formula_ref = displayFormulaRef;
if (automaticFields) queryParams.automatic_fields = automaticFields;
if (pageToken) queryParams.page_token = pageToken;
if (pageSize) queryParams.page_size = pageSize;

const queryString = querystring.stringify(queryParams);
const path = `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records${queryString ? '?' + queryString : ''}`;

const options_req = {
hostname: this.baseUrl,
path: path,
method: 'GET',
headers: {
'Authorization': `Bearer ${this.tenantAccessToken}`,
'Content-Type': 'application/json; charset=utf-8'
}
};

return new Promise((resolve, reject) => {
const req = https.request(options_req, (res) => {
let data = '';

res.on('data', (chunk) => {
data += chunk;
});

res.on('end', () => {
try {
const response = JSON.parse(data);
if (response.code === 0) {
resolve(response.data);
} else {
reject(new Error(`API Error: ${response.code} - ${response.msg}`));
}
} catch (error) {
reject(new Error(`Parse Error: ${error.message}`));
}
});
});

req.on('error', (error) => {
reject(new Error(`Request Error: ${error.message}`));
});

req.end();
});
}

async getAllRecords(appToken, tableId, options = {}) {
const allRecords = [];
let hasMore = true;
let pageToken = null;

while (hasMore) {
const requestOptions = { ...options };
if (pageToken) {
requestOptions.pageToken = pageToken;
}

try {
const response = await this.getRecords(appToken, tableId, requestOptions);
allRecords.push(...response.items);
hasMore = response.has_more;
pageToken = response.page_token;
} catch (error) {
throw error;
}
}

return allRecords;
}
}

class DataProcessor {
static formatValue(value) {
if (value === null || value === undefined) return '';
if (Array.isArray(value)) {
if (value.length === 0) return '';
if (typeof value[0] === 'object' && value[0].name) {
return value.map(item => item.name).join(', ');
}
if (typeof value[0] === 'object' && value[0].file_token) {
return value.map(item => item.name || 'File').join(', ');
}
return value.join(', ');
}
if (typeof value === 'object' && value.name) return value.name;
if (typeof value === 'object' && value.file_token) return value.name || 'File';
if (typeof value === 'number' && value > 1000000000) {
return new Date(value).toLocaleDateString('id-ID');
}
return String(value);
}

static getFileUrls(value) {
if (!value || !Array.isArray(value)) return [];
return value.map(file => ({
name: file.name || 'File',
url: file.url || file.tmp_url,
type: file.type
}));
}

static processRecords(records) {
const fieldsToShow = [
{ key: 'SN', label: 'No.', type: 'text' },
{ key: 'NAMA LENGKAP USER SESUAI KTP', label: 'Nama Lengkap', type: 'text' },
{ key: 'NIK USER', label: 'NIK', type: 'text' },
{ key: 'NOMOR PLAT', label: 'Nomor Plat', type: 'text' },
{ key: 'MERK UNIT', label: 'Merk Unit', type: 'text' },
{ key: 'KOTA TEMPAT TINGGAL USER', label: 'Kota', type: 'text' },
{ key: 'NOMOR SIM C USER', label: 'SIM C', type: 'text' },
{ key: 'ALAMAT LENGKAP USER', label: 'Alamat', type: 'text' },
{ key: 'CATATAN TAMBAHAN', label: 'Catatan', type: 'text' },
{ key: 'KELENGKAPAN UNIT', label: 'Kelengkapan Unit', type: 'text' },
{ key: 'No Telp User', label: 'No. Telepon', type: 'text' },
{ key: 'NAMA PROJECT', label: 'Nama Project', type: 'text' },
{ key: 'PIC PENANGGUNGJAWAB', label: 'PIC', type: 'text' },
{ key: 'TANGGAL KELUAR UNIT', label: 'Tanggal Keluar', type: 'date' },
{ key: 'Submitted on', label: 'Tanggal Submit', type: 'date' },
{ key: 'KTP ASLI', label: 'KTP', type: 'file' },
{ key: 'KK', label: 'KK', type: 'file' },
{ key: 'SIM C ASLI', label: 'SIM C', type: 'file' },
{ key: 'SKCK', label: 'SKCK', type: 'file' },
{ key: 'SURAT KETERANGAN DOMISILI', label: 'Surat Domisili', type: 'file' },
{ key: 'STNK UNIT', label: 'STNK Unit', type: 'file' },
{ key: 'FOTO UNIT BERSAMA USER', label: 'Foto Unit', type: 'file' },
{ key: 'BAST', label: 'BAST', type: 'file' },
{ key: 'Surat Pernyataan Peminjaman', label: 'Surat Pernyataan', type: 'file' }
];

const processedData = records.map(record => {
const processedRecord = {};

fieldsToShow.forEach(field => {
let value = record.fields[field.key];

if (field.key === 'MERK UNIT' && this.formatValue(value) === 'LAINNYA') {
const customValue = record.fields['MERK UNIT-LAINNYA-Text'];
if (customValue) value = customValue;
}

if (field.key === 'KOTA TEMPAT TINGGAL USER' && this.formatValue(value) === 'Lainnya') {
const customValue = record.fields['KOTA TEMPAT TINGGAL USER-Lainnya-Text'];
if (customValue) value = customValue;
}

if (field.type === 'file') {
processedRecord[field.key] = this.getFileUrls(value);
processedRecord[`${field.key}_display`] = this.formatValue(value);
} else {
processedRecord[field.key] = this.formatValue(value);
}
});
processedRecord.record_id = record.record_id;
return processedRecord;
});

return { fields: fieldsToShow, data: processedData };
}

static filterAndSortData(data, searchTerm, filters, sortConfig) {
let filteredData = [...data];

if (searchTerm) {
const searchLower = searchTerm.toLowerCase();
filteredData = filteredData.filter(record =>
Object.entries(record).some(([key, value]) => {
if (key.endsWith('_display') || key === 'record_id') return false;
return value && value.toString().toLowerCase().includes(searchLower);
})
);
}

Object.entries(filters).forEach(([key, value]) => {
if (value) {
filteredData = filteredData.filter(record =>
record[key] && record[key].toString() === value
);
}
});

if (sortConfig.key) {
filteredData.sort((a, b) => {
const aValue = a[sortConfig.key] || '';
const bValue = b[sortConfig.key] || '';

if (sortConfig.direction === 'asc') {
return aValue.toString().localeCompare(bValue.toString());
} else {
return bValue.toString().localeCompare(aValue.toString());
}
});
}

return filteredData;
}

static async generateExcel(data, fields) {
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Larksuite Data');

const visibleFields = fields.filter(field => field.type !== 'file' && field.key !== 'SN');
const headers = ['No', ...visibleFields.map(field => field.label)];

worksheet.addRow(headers);

const headerRow = worksheet.getRow(1);
headerRow.font = { bold: true };
headerRow.fill = {
type: 'pattern',
pattern: 'solid',
fgColor: { argb: 'FFE6E6FA' }
};

data.forEach((record, index) => {
const row = [
index + 1,
...visibleFields.map(field => record[field.key] || '-')
];
worksheet.addRow(row);
});

visibleFields.forEach((field, index) => {
worksheet.getColumn(index + 2).width = Math.min(Math.max(field.label.length, 15), 50);
});

return workbook;
}

static generateCSV(data, fields) {
const visibleFields = fields.filter(field => field.type !== 'file' && field.key !== 'SN');
const headers = ['No', ...visibleFields.map(field => field.label)];

let csv = headers.join(',') + '\n';

data.forEach((record, index) => {
const row = [
index + 1,
...visibleFields.map(field => {
const value = record[field.key] || '-';
return `"${value.toString().replace(/"/g, '""')}"`;
})
];
csv += row.join(',') + '\n';
});

return csv;
}
}

async function getLarkClient() {
const tokens = await refreshTokenIfNeeded();
return new LarkSuiteClient(tokens.tenant_access_token, tokens.user_access_token);
}

router.get('/records', async (req, res) => {
try {
const page = parseInt(req.query.page) || 1;
const pageSize = parseInt(req.query.pageSize) || 50;
const appToken = 'BviZb6erxaOkK0sXrQtlCLACgEd';
const tableId = 'tblQXkV230drxppx';

const client = await getLarkClient();

const data = await client.getRecords(appToken, tableId, {
viewId: 'vew9gGopfl',
automaticFields: true,
pageSize: pageSize
});

const processedData = DataProcessor.processRecords(data.items);

res.json({
success: true,
data: {
...data,
processedData
}
});
} catch (error) {
res.status(500).json({
success: false,
error: error.message
});
}
});

router.get('/records/all', async (req, res) => {
try {
const appToken = 'BviZb6erxaOkK0sXrQtlCLACgEd';
const tableId = 'tblQXkV230drxppx';

const client = await getLarkClient();

const allRecords = await client.getAllRecords(appToken, tableId, {
viewId: 'vew9gGopfl',
automaticFields: true,
pageSize: 500
});

const processedData = DataProcessor.processRecords(allRecords);

res.json({
success: true,
data: {
total: allRecords.length,
items: allRecords,
processedData
}
});
} catch (error) {
res.status(500).json({
success: false,
error: error.message
});
}
});

router.get('/records/export', async (req, res) => {
try {
const { format = 'xlsx', search = '', filters = '{}', sort = '{}' } = req.query;
const appToken = 'BviZb6erxaOkK0sXrQtlCLACgEd';
const tableId = 'tblQXkV230drxppx';

const client = await getLarkClient();

const allRecords = await client.getAllRecords(appToken, tableId, {
viewId: 'vew9gGopfl',
automaticFields: true,
pageSize: 500
});

const processedData = DataProcessor.processRecords(allRecords);
const parsedFilters = JSON.parse(filters);
const parsedSort = JSON.parse(sort);

const filteredData = DataProcessor.filterAndSortData(
processedData.data,
search,
parsedFilters,
parsedSort
);

const timestamp = new Date().toISOString().split('T')[0];
const filename = `larksuite_data_${timestamp}`;

if (format.toLowerCase() === 'xlsx') {
const workbook = await DataProcessor.generateExcel(filteredData, processedData.fields);
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
await workbook.xlsx.write(res);
} else if (format.toLowerCase() === 'csv') {
const csv = DataProcessor.generateCSV(filteredData, processedData.fields);
res.setHeader('Content-Type', 'text/csv');
res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
res.send(csv);
} else {
res.status(400).json({
success: false,
error: 'Unsupported format. Use xlsx or csv.'
});
}
} catch (error) {
res.status(500).json({
success: false,
error: error.message
});
}
});

router.post('/lark/refresh-token', async (req, res) => {
try {
const tokens = await forceRefreshTokens();

res.json({
success: true,
message: 'Lark tokens force refreshed and saved to database successfully',
data: {
tenant_access_token: tokens.tenant_access_token ? '***' : '',
user_access_token: tokens.user_access_token ? '***' : '',
app_access_token: tokens.app_access_token ? '***' : '',
expires_in_seconds: tokens.expire || 0
}
});
} catch (error) {
res.status(500).json({
success: false,
error: error.message
});
}
});

module.exports = router;