
function get_alive (state) {
    var nbr = 0;
    for (var i = 0; i < state.alive.length; i++) {
        if (state.alive[i] === true) { nbr++; }
    }
    return nbr;
}