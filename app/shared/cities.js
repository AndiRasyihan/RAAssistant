// Built-in city list (offline). Coordinates are approximate city centres; tz = IANA zone.
// More places can be searched online (Open-Meteo geocoding) from Settings.
(function (root) {
  const ID = (name, region, lat, lon, tz) => ({ name, region, country: 'ID', lat, lon, tz, tzLabel: tz === 'Asia/Jakarta' ? 'WIB' : tz === 'Asia/Makassar' ? 'WITA' : 'WIT' });
  const J = 'Asia/Jakarta', M = 'Asia/Makassar', P = 'Asia/Jayapura';
  const MY = (name, region, lat, lon) => ({ name, region, country: 'MY', lat, lon, tz: 'Asia/Kuala_Lumpur', tzLabel: 'MYT' });
  const cities = [
    ID('Banda Aceh', 'Aceh', 5.5483, 95.3238, J), ID('Lhokseumawe', 'Aceh', 5.1801, 97.1507, J), ID('Langsa', 'Aceh', 4.4683, 97.9683, J),
    ID('Medan', 'Sumatera Utara', 3.5952, 98.6722, J), ID('Pematangsiantar', 'Sumatera Utara', 2.9595, 99.0687, J), ID('Binjai', 'Sumatera Utara', 3.6001, 98.4854, J), ID('Sibolga', 'Sumatera Utara', 1.7427, 98.7792, J),
    ID('Padang', 'Sumatera Barat', -0.9471, 100.4172, J), ID('Bukittinggi', 'Sumatera Barat', -0.3056, 100.3692, J), ID('Payakumbuh', 'Sumatera Barat', -0.2209, 100.6331, J),
    ID('Pekanbaru', 'Riau', 0.5071, 101.4478, J), ID('Dumai', 'Riau', 1.6654, 101.4476, J),
    ID('Tanjung Pinang', 'Kepulauan Riau', 0.9186, 104.4559, J), ID('Batam', 'Kepulauan Riau', 1.0456, 104.0305, J),
    ID('Jambi', 'Jambi', -1.6101, 103.6131, J), ID('Palembang', 'Sumatera Selatan', -2.9761, 104.7754, J), ID('Lubuklinggau', 'Sumatera Selatan', -3.2945, 102.8616, J), ID('Prabumulih', 'Sumatera Selatan', -3.4328, 104.2350, J),
    ID('Pangkal Pinang', 'Kep. Bangka Belitung', -2.1316, 106.1169, J), ID('Bengkulu', 'Bengkulu', -3.7928, 102.2608, J),
    ID('Bandar Lampung', 'Lampung', -5.3971, 105.2668, J), ID('Metro', 'Lampung', -5.1131, 105.3067, J),
    ID('Jakarta', 'DKI Jakarta', -6.2088, 106.8456, J), ID('Jakarta Selatan', 'DKI Jakarta', -6.2615, 106.8106, J), ID('Jakarta Timur', 'DKI Jakarta', -6.2250, 106.9004, J),
    ID('Jakarta Utara', 'DKI Jakarta', -6.1384, 106.8640, J), ID('Jakarta Barat', 'DKI Jakarta', -6.1674, 106.7637, J),
    ID('Serang', 'Banten', -6.1200, 106.1503, J), ID('Tangerang', 'Banten', -6.1783, 106.6319, J), ID('Tangerang Selatan', 'Banten', -6.2886, 106.7179, J), ID('Cilegon', 'Banten', -6.0025, 106.0110, J),
    ID('Bandung', 'Jawa Barat', -6.9175, 107.6191, J), ID('Bogor', 'Jawa Barat', -6.5971, 106.8060, J), ID('Depok', 'Jawa Barat', -6.4025, 106.7942, J), ID('Bekasi', 'Jawa Barat', -6.2383, 106.9756, J),
    ID('Cimahi', 'Jawa Barat', -6.8722, 107.5425, J), ID('Cirebon', 'Jawa Barat', -6.7320, 108.5523, J), ID('Sukabumi', 'Jawa Barat', -6.9277, 106.9300, J), ID('Tasikmalaya', 'Jawa Barat', -7.3274, 108.2207, J),
    ID('Garut', 'Jawa Barat', -7.2279, 107.9087, J), ID('Karawang', 'Jawa Barat', -6.3227, 107.3376, J), ID('Banjar', 'Jawa Barat', -7.3707, 108.5342, J),
    ID('Semarang', 'Jawa Tengah', -6.9667, 110.4167, J), ID('Surakarta (Solo)', 'Jawa Tengah', -7.5755, 110.8243, J), ID('Magelang', 'Jawa Tengah', -7.4797, 110.2177, J), ID('Salatiga', 'Jawa Tengah', -7.3305, 110.5084, J),
    ID('Pekalongan', 'Jawa Tengah', -6.8898, 109.6746, J), ID('Tegal', 'Jawa Tengah', -6.8694, 109.1402, J), ID('Purwokerto', 'Jawa Tengah', -7.4245, 109.2302, J), ID('Kudus', 'Jawa Tengah', -6.8048, 110.8405, J), ID('Cilacap', 'Jawa Tengah', -7.7268, 109.0094, J),
    ID('Yogyakarta', 'DI Yogyakarta', -7.7956, 110.3695, J), ID('Sleman', 'DI Yogyakarta', -7.7160, 110.3556, J), ID('Bantul', 'DI Yogyakarta', -7.8881, 110.3289, J),
    ID('Surabaya', 'Jawa Timur', -7.2575, 112.7521, J), ID('Malang', 'Jawa Timur', -7.9666, 112.6326, J), ID('Kediri', 'Jawa Timur', -7.8480, 112.0178, J), ID('Madiun', 'Jawa Timur', -7.6298, 111.5239, J),
    ID('Blitar', 'Jawa Timur', -8.0954, 112.1609, J), ID('Jember', 'Jawa Timur', -8.1724, 113.7005, J), ID('Banyuwangi', 'Jawa Timur', -8.2192, 114.3691, J), ID('Probolinggo', 'Jawa Timur', -7.7543, 113.2159, J),
    ID('Pasuruan', 'Jawa Timur', -7.6453, 112.9075, J), ID('Mojokerto', 'Jawa Timur', -7.4722, 112.4338, J), ID('Sidoarjo', 'Jawa Timur', -7.4478, 112.7183, J), ID('Gresik', 'Jawa Timur', -7.1567, 112.6556, J), ID('Batu', 'Jawa Timur', -7.8671, 112.5239, J),
    ID('Denpasar', 'Bali', -8.6705, 115.2126, M), ID('Singaraja', 'Bali', -8.1120, 115.0882, M),
    ID('Mataram', 'Nusa Tenggara Barat', -8.5833, 116.1167, M), ID('Bima', 'Nusa Tenggara Barat', -8.4605, 118.7270, M),
    ID('Kupang', 'Nusa Tenggara Timur', -10.1772, 123.6070, M), ID('Maumere', 'Nusa Tenggara Timur', -8.6199, 122.2111, M),
    ID('Pontianak', 'Kalimantan Barat', -0.0263, 109.3425, J), ID('Singkawang', 'Kalimantan Barat', 0.9060, 108.9853, J),
    ID('Palangka Raya', 'Kalimantan Tengah', -2.2161, 113.9135, J),
    ID('Banjarmasin', 'Kalimantan Selatan', -3.3186, 114.5944, M), ID('Banjarbaru', 'Kalimantan Selatan', -3.4572, 114.8103, M),
    ID('Samarinda', 'Kalimantan Timur', -0.5022, 117.1536, M), ID('Balikpapan', 'Kalimantan Timur', -1.2379, 116.8529, M), ID('Bontang', 'Kalimantan Timur', 0.1333, 117.5000, M), ID('Nusantara (IKN)', 'Kalimantan Timur', -0.9739, 116.7044, M),
    ID('Tanjung Selor', 'Kalimantan Utara', 2.8375, 117.3653, M), ID('Tarakan', 'Kalimantan Utara', 3.3000, 117.6333, M),
    ID('Manado', 'Sulawesi Utara', 1.4748, 124.8421, M), ID('Bitung', 'Sulawesi Utara', 1.4404, 125.1217, M), ID('Gorontalo', 'Gorontalo', 0.5435, 123.0568, M),
    ID('Palu', 'Sulawesi Tengah', -0.8917, 119.8707, M), ID('Mamuju', 'Sulawesi Barat', -2.6748, 118.8885, M),
    ID('Makassar', 'Sulawesi Selatan', -5.1477, 119.4327, M), ID('Gowa (Sungguminasa)', 'Sulawesi Selatan', -5.2120, 119.4520, M), ID('Maros', 'Sulawesi Selatan', -5.0068, 119.5729, M),
    ID('Parepare', 'Sulawesi Selatan', -4.0135, 119.6255, M), ID('Palopo', 'Sulawesi Selatan', -2.9925, 120.1969, M), ID('Bone (Watampone)', 'Sulawesi Selatan', -4.5386, 120.3279, M),
    ID('Bulukumba', 'Sulawesi Selatan', -5.5590, 120.1906, M), ID('Takalar', 'Sulawesi Selatan', -5.4167, 119.4880, M), ID('Pinrang', 'Sulawesi Selatan', -3.7857, 119.6522, M),
    ID('Kendari', 'Sulawesi Tenggara', -3.9985, 122.5129, M), ID('Baubau', 'Sulawesi Tenggara', -5.4700, 122.6000, M),
    ID('Ambon', 'Maluku', -3.6954, 128.1814, P), ID('Tual', 'Maluku', -5.6420, 132.7470, P), ID('Sofifi', 'Maluku Utara', 0.7333, 127.5667, P), ID('Ternate', 'Maluku Utara', 0.7893, 127.3816, P),
    ID('Jayapura', 'Papua', -2.5337, 140.7181, P), ID('Merauke', 'Papua Selatan', -8.4932, 140.4018, P), ID('Nabire', 'Papua Tengah', -3.3667, 135.4833, P), ID('Timika', 'Papua Tengah', -4.5500, 136.8833, P),
    ID('Wamena', 'Papua Pegunungan', -4.0950, 138.9440, P), ID('Manokwari', 'Papua Barat', -0.8615, 134.0620, P), ID('Sorong', 'Papua Barat Daya', -0.8762, 131.2558, P),
    MY('Kuala Lumpur', 'W.P. Kuala Lumpur', 3.1390, 101.6869), MY('Putrajaya', 'W.P. Putrajaya', 2.9264, 101.6964), MY('Shah Alam', 'Selangor', 3.0733, 101.5185),
    MY('Petaling Jaya', 'Selangor', 3.1073, 101.6067), MY('George Town', 'Pulau Pinang', 5.4141, 100.3288), MY('Ipoh', 'Perak', 4.5975, 101.0901),
    MY('Johor Bahru', 'Johor', 1.4927, 103.7414), MY('Melaka', 'Melaka', 2.1896, 102.2501), MY('Seremban', 'Negeri Sembilan', 2.7297, 101.9381),
    MY('Kuantan', 'Pahang', 3.8077, 103.3260), MY('Kuala Terengganu', 'Terengganu', 5.3302, 103.1408), MY('Kota Bharu', 'Kelantan', 6.1254, 102.2381),
    MY('Alor Setar', 'Kedah', 6.1248, 100.3678), MY('Kangar', 'Perlis', 6.4414, 100.1986), MY('Kota Kinabalu', 'Sabah', 5.9804, 116.0735),
    MY('Sandakan', 'Sabah', 5.8402, 118.1179), MY('Kuching', 'Sarawak', 1.5535, 110.3593), MY('Miri', 'Sarawak', 4.3995, 113.9914), MY('Labuan', 'W.P. Labuan', 5.2831, 115.2308)
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = cities; else root.RACITIES = cities;
})(typeof window !== 'undefined' ? window : globalThis);
