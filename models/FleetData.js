const mongoose = require('mongoose');

const FleetDataSchema = new mongoose.Schema({
submittedOn: {
type: String,
trim: true,
default: ''
},
respondents: {
type: String,
trim: true,
default: ''
},
tanggalKeluarUnit: {
type: String,
trim: true,
default: ''
},
merkUnit: {
type: String,
trim: true,
default: '',
index: true
},
merkUnitLainnyaText: {
type: String,
trim: true,
default: ''
},
nomorPlat: {
type: String,
required: true,
trim: true,
uppercase: true,
index: true
},
picPenanggungjawab: {
type: String,
trim: true,
default: ''
},
picPenanggungjawabLainnyaTeks: {
type: String,
trim: true,
default: ''
},
namaLengkapUserSesuaiKtp: {
type: String,
required: true,
trim: true,
index: true
},
nikUser: {
type: String,
trim: true,
default: '',
index: true
},
nomorSimCUser: {
type: String,
trim: true,
default: ''
},
alamatLengkapUser: {
type: String,
trim: true,
default: ''
},
kotaTempatTinggalUser: {
type: String,
trim: true,
default: '',
index: true
},
kotaTempatTinggalUserLainnyaText: {
type: String,
trim: true,
default: ''
},
kelengkapanUnit: {
type: String,
trim: true,
default: ''
},
kelengkapanUnitAksesorisText: {
type: String,
trim: true,
default: ''
},
catatanTambahan: {
type: String,
trim: true,
default: ''
},
ktpAsli: {
type: String,
trim: true,
default: ''
},
simCAsli: {
type: String,
trim: true,
default: ''
},
kk: {
type: String,
trim: true,
default: ''
},
skck: {
type: String,
trim: true,
default: ''
},
suratKeteranganDomisili: {
type: String,
trim: true,
default: ''
},
suratPernyataanPeminjaman: {
type: String,
trim: true,
default: ''
},
bast: {
type: String,
trim: true,
default: ''
},
fotoUnitBersamaUser: {
type: String,
trim: true,
default: ''
},
noTelpUser: {
type: String,
trim: true,
default: '',
index: true
},
namaProject: {
type: String,
trim: true,
default: '',
index: true
},
stnkUnit: {
type: String,
trim: true,
default: ''
},
createdAt: {
type: Date,
default: Date.now,
index: true
},
updatedAt: {
type: Date,
default: Date.now
}
});

FleetDataSchema.pre('save', function(next) {
this.updatedAt = Date.now();
next();
});

FleetDataSchema.index({ nomorPlat: 1 });
FleetDataSchema.index({ merkUnit: 1 });
FleetDataSchema.index({ namaLengkapUserSesuaiKtp: 1 });
FleetDataSchema.index({ nikUser: 1 });
FleetDataSchema.index({ noTelpUser: 1 });
FleetDataSchema.index({ kotaTempatTinggalUser: 1 });
FleetDataSchema.index({ namaProject: 1 });
FleetDataSchema.index({ createdAt: -1 });

FleetDataSchema.index({ 
nomorPlat: 'text', 
merkUnit: 'text', 
namaLengkapUserSesuaiKtp: 'text',
nikUser: 'text',
noTelpUser: 'text',
kotaTempatTinggalUser: 'text',
namaProject: 'text'
});

FleetDataSchema.index({ merkUnit: 1, kotaTempatTinggalUser: 1 });
FleetDataSchema.index({ namaProject: 1, merkUnit: 1 });
FleetDataSchema.index({ createdAt: -1, merkUnit: 1 });

module.exports = mongoose.model('FleetData', FleetDataSchema);