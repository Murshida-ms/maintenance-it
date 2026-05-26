const dayjs = require('dayjs');

module.exports = {

    formatDate(date){

        if(!date)
            return '';

        return dayjs(date)
            .format('DD/MM/YYYY');

    },

    formatDateTime(date){

        if(!date)
            return '';

        return dayjs(date)
            .format('DD/MM/YYYY HH:mm');

    },

    number(value){

        return Number(value || 0)
            .toLocaleString();

    },

    currency(value){

        return Number(value || 0)
            .toLocaleString(
                'th-TH',
                {
                    minimumFractionDigits:2,
                    maximumFractionDigits:2
                }
            );

    }

};