pragma solidity 0.4.15;


contract Coin {
    // The keyword "public" makes those variables
    // readable from outside.
    mapping (address => uint) public balances;
    mapping (address => mapping (address => uint)) public allowance;

    // Events allow light clients to react on
    // changes efficiently.
    event Transfer(address from, address to, uint amount);

    function mint(address receiver, uint amount) public {
        balances[receiver] += amount;
    }

    // solhint-disable-next-line no-simple-event-func-name
    function transfer(address _receiver, uint _amount) public returns(bool) {
        if (balances[msg.sender] < _amount) {
            return false;
        }
        balances[msg.sender] -= _amount;
        balances[_receiver] += _amount;
        Transfer(msg.sender, _receiver, _amount);
        return true;
    }

    function transferFrom(address _from, address _to, uint _amount) public returns(bool) {
        if (balances[_from] < _amount) {
            return false;
        }
        balances[_from] -= _amount;
        balances[_to] += _amount;
        Transfer(_from, _to, _amount);
        return true;
    }

    function balanceOf(address _address) public constant returns(uint) {
        return balances[_address];
    }

    function balanceEth(address _address) public constant returns(uint) {
        return _address.balance;
    }

    function approve(address _spender, uint _amount) public returns(bool) {
        allowance[msg.sender][_spender] += _amount;
        return true;
    }

    // solhint-disable-next-line no-empty-blocks
    function() public payable { }
}
