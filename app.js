// Глобальная переменная для графика, чтобы можно было его перерисовывать
let myChart = null;
let dealStagesDict = {};

// 1. Инициализация приложения Битрикс24
BX24.init(function () {
    console.log('Битрикс24 успешно инициализирован');

    // Сначала загружаем справочник стадий
    BX24.callMethod('crm.status.list', { filter: { ENTITY_ID: 'DEAL_STAGE' } }, function(result) {
        if(result.error()) {
            console.error("Ошибка загрузки стадий:", result.error());
        } else {
            // Заполняем словарь: { "NEW": "Новая", "PREPARATION": "Подготовка" ... }
            result.data().forEach(stage => {
                dealStagesDict[stage.STATUS_ID] = stage.NAME;
            });
        }
        // После загрузки стадий (успешной или нет) загружаем сделки
        loadDeals();
    });
});

// 2. Загрузка сделок с пагинацией
function loadDeals() {
    let allDeals = [];
    let start = 0;
    const batchSize = 50;

    // Формируем фильтр по дате
    const filterValue = document.getElementById('date-filter').value;
    let filter = {};
    const today = new Date();

    if (filterValue === '30') {
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 30);
        filter = { ">=BEGINDATE": pastDate.toISOString().split('T')[0] };
    } else if (filterValue === 'month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        filter = { ">=BEGINDATE": firstDay.toISOString().split('T')[0] };
        // DATE_CREATE
    }

    function fetchBatch() {
        BX24.callMethod(
            'crm.deal.list',
            {
                order: { "ID": "DESC" },
                select: ["ID", "OPPORTUNITY", "STAGE_ID"],
                filter: filter, // <--- Передаем фильтр сюда
                start: start
            },
            function(result) {
                if(result.error()) {
                    console.error(result.error());
                    document.getElementById('loader').textContent = 'Ошибка загрузки данных: ' + result.error();
                    return;
                }

                const data = result.data();
                allDeals = allDeals.concat(data);

                // Если есть еще данные (result.more() === true), грузим следующую пачку
                if (result.more()) {
                    start += batchSize;
                    fetchBatch(); // Рекурсивный вызов
                } else {
                    // Все данные собраны, запускаем обработку
                    processData(allDeals);
                }
            }
        );
    }

    fetchBatch();
}

// 3. Обработка и агрегация данных
function processData(deals) {
    let totalSum = 0;
    let count = deals.length;
    let stagesMap = {};

    deals.forEach(deal => {
        // ОППОРТУНИТИ (сумма) может приходить как строка, поэтому parseFloat
        const sum = parseFloat(deal.OPPORTUNITY) || 0;
        totalSum += sum;

        // Группируем суммы по стадиям
        const stage = deal.STAGE_ID || 'UNKNOWN';
        if (!stagesMap[stage]) {
            stagesMap[stage] = 0;
        }
        stagesMap[stage] += sum;
    });

    const avgCheck = count > 0 ? totalSum / count : 0;

    // Красивое форматирование валюты (например, 150 000 ₽)
    const formatter = new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0
    });

    // Обновляем цифры в HTML
    document.getElementById('total-sum').textContent = formatter.format(totalSum);
    document.getElementById('total-count').textContent = count;
    document.getElementById('average-check').textContent = formatter.format(avgCheck);

    // Скрываем лоадер, показываем контент
    document.getElementById('loader').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Рисуем график
    renderChart(stagesMap);
}

// 4. Отрисовка графика через Chart.js
function renderChart(stagesMap) {
    const ctx = document.getElementById('dealsChart').getContext('2d');

    // Получаем названия стадий (пока это ID, в будущем можно сделать красивые названия)
    // Было:
    // const labels = Object.keys(stagesMap);

    // Стало (подменяем ID на название из словаря):
    const labels = Object.keys(stagesMap).map(stageId => dealStagesDict[stageId] || stageId);
    const data = Object.values(stagesMap);

    // Если график уже был нарисован (например, при обновлении), удаляем старый
    if (myChart) {
        myChart.destroy();
    }

    // Создаем новый график
    myChart = new Chart(ctx, {
        type: 'bar', // Столбчатая диаграмма
        data: {
            labels: labels,
            datasets: [{
                label: 'Сумма по стадиям (₽)',
                data: data,
                backgroundColor: 'rgba(47, 199, 247, 0.6)', // Наш голубой цвет
                borderColor: 'rgba(47, 199, 247, 1)',
                borderWidth: 1,
                borderRadius: 4 // Закругленные края у столбцов
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false } // Скрываем легенду, так как один датасет
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        // Форматируем ось Y, чтобы показывать тысячи/миллионы
                        callback: function(value) {
                            if (value >= 1000000) return (value / 1000000) + 'M';
                            if (value >= 1000) return (value / 1000) + 'K';
                            return value;
                        }
                    }
                }
            }
        }
    });
}

// Обработчик смены фильтра
document.getElementById('date-filter').addEventListener('change', function() {
    // Показываем лоадер, прячем старые данные
    document.getElementById('loader').style.display = 'block';
    document.getElementById('content').style.display = 'none';
    // Запускаем загрузку заново
    loadDeals();
});